package handlers

import (
	"context"
	"time"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
)

//
// POST /api/components/:slug/versions  (protected)
//
func AddVersion(c *fiber.Ctx) error {
	componentSlug := c.Params("slug")

	var version models.ComponentVersion
	if err := c.BodyParser(&version); err != nil {
		return utils.Error(c, 400, "invalid JSON body")
	}
	if strings.TrimSpace(version.Version) == "" {
		return utils.Error(c, 400, "version number required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": componentSlug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	uid, _ := c.Locals("user_id").(string)
	version.ComponentID = comp.ID
	version.CreatedBy = uid
	version.CreatedAt = time.Now()
	version.CodeURL = strings.TrimSpace(version.CodeURL)
	version.PreviewURL = strings.TrimSpace(version.PreviewURL)
	version.Readme = strings.TrimSpace(version.Readme)


	verCol := db.Client.Database("storehub").Collection("component_versions")
	if _, err := verCol.InsertOne(ctx, version); err != nil {
		return utils.Error(c, 500, "failed to insert version")
	}

	return utils.Success(c, fiber.Map{
		"status":  "version added",
		"version": version,
	})
}

//
// GET /components/:slug/versions  (public)
//
func GetComponentVersions(c *fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	verCol := db.Client.Database("storehub").Collection("component_versions")
	cursor, err := verCol.Find(ctx, bson.M{"componentId": comp.ID})
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	// Pre-init to ensure JSON array, not null
	versions := make([]models.ComponentVersion, 0)
	if err := cursor.All(ctx, &versions); err != nil {
		return utils.Error(c, 500, "failed to decode versions")
	}

	return utils.Success(c, fiber.Map{
		"versions": versions, // [] when empty
	})
}
