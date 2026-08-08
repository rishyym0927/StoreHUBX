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

// PATCH /api/components/:slug/visibility (protected, owner-only)
func UpdateVisibility(c *fiber.Ctx) error {
	slug := c.Params("slug")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	var payload struct {
		Visibility string `json:"visibility"`
	}
	if err := c.BodyParser(&payload); err != nil || (payload.Visibility != "public" && payload.Visibility != "private") {
		return utils.Error(c, 400, `visibility must be "public" or "private"`)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")
	res, err := col.UpdateOne(ctx,
		bson.M{"slug": slug, "ownerId": uid},
		bson.M{"$set": bson.M{"visibility": payload.Visibility, "updatedAt": time.Now()}},
	)
	if err != nil {
		return utils.Error(c, 500, "failed to update visibility")
	}
	if res.MatchedCount == 0 {
		return utils.Error(c, 404, "component not found or unauthorized")
	}
	invalidateComponentCaches(ctx, slug)

	return utils.Success(c, fiber.Map{"message": "visibility updated", "visibility": payload.Visibility})
}

// POST /api/components/:slug/collaborators (protected, owner-only)
func AddCollaborator(c *fiber.Ctx) error {
	slug := c.Params("slug")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	var payload struct {
		UserID string `json:"userId"`
	}
	if err := c.BodyParser(&payload); err != nil || payload.UserID == "" {
		return utils.Error(c, 400, "userId is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")

	userCol := db.Client.Database("storehub").Collection("users")
	if err := userCol.FindOne(ctx, bson.M{"providerId": payload.UserID}).Err(); err != nil {
		return utils.Error(c, 404, "user not found")
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated models.Component
	err := col.FindOneAndUpdate(ctx,
		bson.M{"slug": slug, "ownerId": uid},
		bson.M{"$addToSet": bson.M{"collaborators": payload.UserID}, "$set": bson.M{"updatedAt": time.Now()}},
		opts,
	).Decode(&updated)
	if err != nil {
		return utils.Error(c, 404, "component not found or unauthorized")
	}
	invalidateComponentCaches(ctx, slug)

	return utils.Success(c, fiber.Map{"message": "collaborator added", "component": updated})
}

// DELETE /api/components/:slug/collaborators/:userId (protected, owner-only)
func RemoveCollaborator(c *fiber.Ctx) error {
	slug := c.Params("slug")
	targetUserID := c.Params("userId")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated models.Component
	err := col.FindOneAndUpdate(ctx,
		bson.M{"slug": slug, "ownerId": uid},
		bson.M{"$pull": bson.M{"collaborators": targetUserID}, "$set": bson.M{"updatedAt": time.Now()}},
		opts,
	).Decode(&updated)
	if err != nil {
		return utils.Error(c, 404, "component not found or unauthorized")
	}
	invalidateComponentCaches(ctx, slug)

	return utils.Success(c, fiber.Map{"message": "collaborator removed", "component": updated})
}
