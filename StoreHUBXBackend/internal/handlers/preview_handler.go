package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// GET /preview/:slug/:version -> 302 to the latest successful build's bundle URL
func RedirectPreview(c *fiber.Ctx) error {
	slug := c.Params("slug")
	ver := c.Params("version")
	if slug == "" || ver == "" {
		return utils.Error(c, 400, "missing slug or version")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}
	if comp.Visibility == "private" {
		uid, _ := c.Locals("user_id").(string)
		if uid == "" || (uid != comp.OwnerID && !contains(comp.Collaborators, uid)) {
			return utils.Error(c, 404, "component not found")
		}
	}

	jobCol := db.Client.Database("storehub").Collection("build_jobs")
	opts := options.FindOne().SetSort(bson.D{{Key: "createdAt", Value: -1}})
	var job models.BuildJob
	err = jobCol.FindOne(ctx, bson.M{
		"componentId": comp.ID,
		"version":     ver,
		"status":      models.BuildSuccess,
	}, opts).Decode(&job)
	if err != nil || job.Artifacts == nil || job.Artifacts.BundleURL == "" {
		return utils.Error(c, 404, "preview not available for this version")
	}

	return c.Redirect(job.Artifacts.BundleURL, fiber.StatusFound) // 302
}
