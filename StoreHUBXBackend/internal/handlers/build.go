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
// waiting for the next fallback poll tick. Best-effort: the BuildJob row
// itself is the source of truth, so a dropped XADD just means this job
// gets picked up by the slower Mongo poll instead of instantly.
func notifyWorker(ctx context.Context, jobID primitive.ObjectID) {
	if cache.Client == nil {
		return
	}
	_ = cache.Client.XAdd(ctx, &redis.XAddArgs{
		Stream: worker.BuildStreamKey,
		Values: map[string]interface{}{"jobId": jobID.Hex()},
	}).Err()
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

	// 1) Find component
	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}
	if comp.RepoLink.Owner == "" || comp.RepoLink.Repo == "" {
		return utils.Error(c, 400, "component is not linked to a GitHub repo")
	}

	// 2) Ensure version exists (optional but good)
	verCol := db.Client.Database("storehub").Collection("component_versions")
	var ver models.ComponentVersion
	if err := verCol.FindOne(ctx, bson.M{"componentId": comp.ID, "version": versionStr}).Decode(&ver); err != nil {
		return utils.Error(c, 404, "version not found")
	}

	uid, _ := c.Locals("user_id").(string)

	// 2.5) Build cache: reuse another version's output if it was already
	// built successfully from the exact same commit.
	if ver.CommitSHA != "" {
		if cached, ok := findCachedBuild(ctx, comp.ID, ver.CommitSHA); ok {
			if cached.VersionID == ver.ID {
				// This exact version already has a successful build for this
				// commit — return it as-is instead of inserting a duplicate.
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

	// 3) Create a job
	job := models.BuildJob{
		ID:          primitive.NilObjectID,
		ComponentID: comp.ID,
		VersionID:   ver.ID,
		Component:   slug,
		Version:     versionStr,
		Status:      models.BuildQueued,
		OwnerID:     uid,
		Repo: models.BuildRepo{
			Owner:  comp.RepoLink.Owner,
			Repo:   comp.RepoLink.Repo,
			Path:   comp.RepoLink.Path,
			Ref:    comp.RepoLink.Ref,
			Commit: comp.RepoLink.Commit,
		},
		Logs:        []string{"enqueued"},
		MaxAttempts: 3,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	jobCol := db.Client.Database("storehub").Collection("build_jobs")
	res, err := jobCol.InsertOne(ctx, job)
	if err != nil {
		return utils.Error(c, 500, "failed to enqueue build")
	}
	oid, _ := res.InsertedID.(primitive.ObjectID)
	notifyWorker(ctx, oid)

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

	jobCol := db.Client.Database("storehub").Collection("build_jobs")
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

	jobCol := db.Client.Database("storehub").Collection("build_jobs")
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
