package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/auth"
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
		// An iframe src can't carry an Authorization header, so a browser
		// viewing this URL directly (as version-list.tsx does) never has
		// OptionalAuth-derived uid set. Allow a short-lived ?token= minted by
		// GET /api/components/:slug/versions/:version/preview-token as an
		// alternative proof of identity, scoped to this exact slug/version.
		// If both a header and a valid token are present, the token wins
		// (it's the more specific, purpose-built credential for this route);
		// an invalid/expired/mismatched token is silently ignored so the
		// request just degrades to whatever the header already established.
		if token := c.Query("token"); token != "" {
			if tokenUID, ok := auth.VerifyPreviewToken(token, slug, ver); ok {
				uid = tokenUID
			}
		}
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

// GET /api/components/:slug/versions/:version/preview-token -> mints a
// short-lived (2 minute) token an owner/collaborator can append as
// ?token= on GET /preview/:slug/:version, since a plain iframe src can't
// carry an Authorization header for a private component's preview.
func GetPreviewToken(c *fiber.Ctx) error {
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

	uid, _ := c.Locals("user_id").(string)
	if uid == "" || (uid != comp.OwnerID && !contains(comp.Collaborators, uid)) {
		return utils.Error(c, 403, "not authorized to preview this component")
	}

	token, err := auth.GeneratePreviewToken(uid, slug, versionStr)
	if err != nil {
		return utils.Error(c, 500, "failed to generate preview token")
	}

	return utils.Success(c, fiber.Map{"token": token, "expiresIn": 120})
}
