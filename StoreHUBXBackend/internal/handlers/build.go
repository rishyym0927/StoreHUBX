package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"github.com/rishyym0927/storehubx/internal/cache"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"github.com/rishyym0927/storehubx/internal/worker"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// notifyWorker pushes the job id onto the Redis Stream a worker's
// streamLoop is blocked on, so it's picked up immediately instead of
// waiting for the next 30s poll. Best-effort: the BuildJob row is the
// source of truth, so a dropped XAdd just delays pickup, it doesn't lose the job.
func notifyWorker(ctx context.Context, jobID primitive.ObjectID) {
	if cache.Client == nil {
		return
	}
	_ = cache.Client.XAdd(ctx, &redis.XAddArgs{
		Stream: worker.BuildStreamKey,
		Values: map[string]interface{}{"jobId": jobID.Hex()},
	}).Err()
}

// enqueueBuildJob inserts a queued BuildJob and notifies the worker. Shared
// by every path that triggers a build (manual, auto-deploy, webhook, initial link).
func enqueueBuildJob(ctx context.Context, comp *models.Component, versionID primitive.ObjectID, versionStr, ownerID, logMsg string, repo models.BuildRepo) (primitive.ObjectID, error) {
	job := models.BuildJob{
		ComponentID: comp.ID,
		VersionID:   versionID,
		Component:   comp.Slug,
		Version:     versionStr,
		Status:      models.BuildQueued,
		OwnerID:     ownerID,
		Repo:        repo,
		Logs:        []string{logMsg},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	jobCol := db.DB().Collection("build_jobs")
	res, err := jobCol.InsertOne(ctx, job)
	if err != nil {
		return primitive.NilObjectID, err
	}
	oid := res.InsertedID.(primitive.ObjectID)
	notifyWorker(ctx, oid)
	return oid, nil
}

// POST /api/components/:slug/versions/:version/build
func EnqueueBuild(c *fiber.Ctx) error {
	slug := c.Params("slug")
	versionStr := c.Params("version")
	if slug == "" || versionStr == "" {
		return utils.Error(c, 400, "missing slug or version")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}
	if comp.RepoLink.Owner == "" || comp.RepoLink.Repo == "" {
		return utils.Error(c, 400, "component is not linked to a GitHub repo")
	}

	verCol := db.DB().Collection("component_versions")
	var ver models.ComponentVersion
	if err := verCol.FindOne(ctx, bson.M{"componentId": comp.ID, "version": versionStr}).Decode(&ver); err != nil {
		return utils.Error(c, 404, "version not found")
	}

	uid, _ := c.Locals("user_id").(string)

	// Build cache: reuse another version's output if it was already built
	// successfully from the exact same commit.
	if ver.CommitSHA != "" {
		if cached, ok := findCachedBuild(ctx, comp.ID, ver.CommitSHA); ok {
			if cached.VersionID == ver.ID {
				return utils.Success(c, fiber.Map{
					"status":  "cached",
					"jobId":   cached.ID.Hex(),
					"message": "this version was already built successfully from this commit",
				})
			}
			reuseCachedBuild(ctx, cached, comp.ID, ver.ID, slug, versionStr, uid)
			return utils.Success(c, fiber.Map{
				"status":  "cached",
				"message": "reused build output from an identical commit",
			})
		}
	}

	oid, err := enqueueBuildJob(ctx, &comp, ver.ID, versionStr, uid, "enqueued", comp.RepoLink.AsBuildRepo())
	if err != nil {
		return utils.Error(c, 500, "failed to enqueue build")
	}

	return utils.Success(c, fiber.Map{
		"jobId":  oid.Hex(),
		"status": "queued",
	})
}

// GET /api/builds/:id
func GetBuild(c *fiber.Ctx) error {
	id := c.Params("id")
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return utils.Error(c, 400, "invalid id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	jobCol := db.DB().Collection("build_jobs")
	var job models.BuildJob
	if err := jobCol.FindOne(ctx, bson.M{"_id": oid}).Decode(&job); err != nil {
		return utils.Error(c, 404, "build not found")
	}

	return utils.Success(c, fiber.Map{"build": job})
}

// (Optional) GET /api/components/:slug/versions/:version/builds  -> list history
func ListBuildsForVersion(c *fiber.Ctx) error {
	slug := c.Params("slug")
	versionStr := c.Params("version")
	if slug == "" || versionStr == "" {
		return utils.Error(c, 400, "missing slug or version")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	jobCol := db.DB().Collection("build_jobs")
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}) // newest (latest attempt) first
	cur, err := jobCol.Find(ctx, bson.M{"component": slug, "version": versionStr}, opts)
	if err != nil {
		return utils.Error(c, 500, "db error")
	}
	defer cur.Close(ctx)

	var jobs []models.BuildJob
	if err := cur.All(ctx, &jobs); err != nil {
		return utils.Error(c, 500, "decode error")
	}

	return utils.Success(c, fiber.Map{"builds": jobs})
}
