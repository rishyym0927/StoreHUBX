package handlers

import (
	"context"
	"time"

	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type linkPayload struct {
	Owner  string `json:"owner"`
	Repo   string `json:"repo"`
	Path   string `json:"path"`
	Ref    string `json:"ref"`
	Commit string `json:"commit"`
}

func LinkComponentRepo(c *fiber.Ctx) error {
	slug := c.Params("slug")
	if slug == "" {
		return utils.Error(c, 400, "missing slug")
	}
	var body linkPayload
	if err := c.BodyParser(&body); err != nil {
		return utils.Error(c, 400, "invalid JSON body")
	}
	if body.Owner == "" || body.Repo == "" {
		return utils.Error(c, 400, "owner and repo are required")
	}

	fmt.Printf("DEBUG: Received payload: %+v\n", body)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")
	uid, _ := c.Locals("user_id").(string)

	filter := bson.M{"slug": slug, "ownerId": uid}
	update := bson.M{
		"$set": bson.M{
			"repoLink": bson.M{
				"owner":  body.Owner,
				"repo":   body.Repo,
				"path":   body.Path,
				"ref":    body.Ref,
				"commit": body.Commit,
			},
			"updatedAt": time.Now(),
		},
	}

	// Use UpdateOne to inspect counts
	res, err := col.UpdateOne(ctx, filter, update)
	if err != nil {
		return utils.Error(c, 500, "database update error")
	}
	// If nothing matched, tell the caller plainly
	if res.MatchedCount == 0 {
		return utils.Error(c, 404, "component not found or unauthorized")
	}

	// Read back the updated document to confirm what's in DB
	var updated models.Component
	if err := col.FindOne(ctx, filter).Decode(&updated); err != nil {
		return utils.Error(c, 500, "failed to read updated component")
	}

	// Auto-create first version if no versions exist
	verCol := db.Client.Database("storehub").Collection("component_versions")

	count, err := verCol.CountDocuments(ctx, bson.M{"componentId": updated.ID})
	if err != nil {
		return utils.Error(c, 500, "failed to check versions")
	}

	var firstVersion *models.ComponentVersion

	if count == 0 && body.Commit != "" {
		// Create initial version (1.0.0)
		firstVersion = &models.ComponentVersion{
			ComponentID: updated.ID,
			Version:     "1.0.0",
			Changelog:   fmt.Sprintf("Initial version linked to %s/%s at commit %s", body.Owner, body.Repo, body.Commit[:7]),
			CommitSHA:   body.Commit,
			BuildState:  models.VersionBuildQueued,
			CreatedBy:   uid,
			CreatedAt:   time.Now(),
		}

		insertResult, err := verCol.InsertOne(ctx, firstVersion)
		if err != nil {
			fmt.Printf("WARNING: Failed to create initial version: %v\n", err)
		} else {
			firstVersion.ID = insertResult.InsertedID.(primitive.ObjectID)

			// Enqueue build job for the initial version
			job := models.BuildJob{
				ComponentID: updated.ID,
				Component:   slug,
				Version:     "1.0.0",
				Status:      models.BuildQueued,
				OwnerID:     uid,
				Repo: models.BuildRepo{
					Owner:  body.Owner,
					Repo:   body.Repo,
					Path:   body.Path,
					Ref:    body.Ref,
					Commit: body.Commit,
				},
				Logs:      []string{"enqueued - initial version"},
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}

			jobCol := db.Client.Database("storehub").Collection("build_jobs")
			jobRes, err := jobCol.InsertOne(ctx, job)
			if err == nil {
				jobID, _ := jobRes.InsertedID.(primitive.ObjectID)
				fmt.Printf("Created initial build job: %s\n", jobID.Hex())
			}
		}
	}

	return utils.Success(c, fiber.Map{
		"component":      updated,
		"initialVersion": firstVersion,
		"message":        "Component linked successfully. Initial version created and build queued.",
	})
}
