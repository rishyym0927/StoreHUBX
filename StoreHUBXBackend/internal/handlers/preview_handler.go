package handlers

import (
	"context"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
)

// GET /preview/:slug/:version -> 302 to public previewUrl
func RedirectPreview(c *fiber.Ctx) error {
	// Debug information
	log.Printf("Preview request received: URL=%s, Method=%s, Path=%s", c.BaseURL()+c.OriginalURL(), c.Method(), c.Path())

	slug := c.Params("slug")
	ver := c.Params("version")
	log.Printf("Preview params: slug=%s, version=%s", slug, ver)

	if slug == "" || ver == "" {
		return utils.Error(c, 400, "missing slug or version")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	colComp := db.Client.Database("storehub").Collection("components")
	var comp struct {
		ID any `bson:"_id"`
	}
	if err := colComp.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	colVer := db.Client.Database("storehub").Collection("component_versions")
	var v struct {
		PreviewURL string `bson:"previewUrl"`
	}
	if err := colVer.FindOne(ctx, bson.M{"componentId": comp.ID, "version": ver}).Decode(&v); err != nil {
		return utils.Error(c, 404, "version not found")
	}
	if v.PreviewURL == "" {
		return utils.Error(c, 404, "preview not available for this version")
	}

	return c.Redirect(v.PreviewURL, fiber.StatusFound) // 302
}
