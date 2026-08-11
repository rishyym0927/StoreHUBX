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

// buildProfileResponse fetches a user and their visible components. A
// private component only shows up for the owner or a listed collaborator.
func buildProfileResponse(ctx context.Context, ownerID, viewerID string) (fiber.Map, error) {
	userCol := db.DB().Collection("users")
	var user models.User
	if err := userCol.FindOne(ctx, bson.M{"providerId": ownerID}).Decode(&user); err != nil {
		return nil, err
	}

	filter := bson.M{"ownerId": ownerID}
	if viewerID != ownerID {
		filter["$or"] = []bson.M{
			{"visibility": bson.M{"$ne": "private"}},
			{"collaborators": viewerID},
		}
	}

	componentCol := db.DB().Collection("components")
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}})
	cursor, err := componentCol.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	components := make([]models.Component, 0)
	if err := cursor.All(ctx, &components); err != nil {
		return nil, err
	}

	return fiber.Map{
		"user": fiber.Map{
			// "id" is the providerId, not the Mongo _id: it's what
			// Component.OwnerID/JWT's user_id claim use, and what the
			// frontend's isOwner/currentUserId checks compare against.
			"id":         user.ProviderID,
			"name":       user.Name,
			"email":      user.Email,
			"username":   user.Username,
			"avatarUrl":  user.AvatarURL,
			"provider":   user.Provider,
			"providerId": user.ProviderID,
			"createdAt":  user.CreatedAt,
			"updatedAt":  user.UpdatedAt,
		},
		"components": components,
		"stats":      fiber.Map{"totalComponents": len(components)},
	}, nil
}

// GetProfile returns the authenticated caller's own profile + components.
func GetProfile(c *fiber.Ctx) error {
	providerId, ok := c.Locals("user_id").(string)
	if !ok || providerId == "" {
		return utils.Error(c, 401, "unauthorized: invalid user ID")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := buildProfileResponse(ctx, providerId, providerId)
	if err != nil {
		return utils.Error(c, 404, "user not found")
	}
	resp["status"] = "authenticated"
	return utils.Success(c, resp)
}

// GetProfileById returns a user's public profile + components by provider ID.
func GetProfileById(c *fiber.Ctx) error {
	providerId := c.Params("id")
	if providerId == "" {
		return utils.Error(c, 400, "provider ID is required")
	}
	viewerID, _ := c.Locals("user_id").(string)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := buildProfileResponse(ctx, providerId, viewerID)
	if err != nil {
		return utils.Error(c, 404, "user not found")
	}
	return utils.Success(c, resp)
}
