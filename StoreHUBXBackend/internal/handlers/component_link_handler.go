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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")

	filter := bson.M{"slug": slug}
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
		return utils.Error(c, 404, "component not found")
	}

	// Read back the updated document to confirm what's in DB
	var updated models.Component
	if err := col.FindOne(ctx, filter).Decode(&updated); err != nil {
		return utils.Error(c, 500, "failed to read updated component")
	}

	return utils.Success(c, fiber.Map{"component": updated})
}
