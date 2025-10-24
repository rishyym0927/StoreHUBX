package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
)

// GetProfile returns complete user details with all their components
func GetProfile(c *fiber.Ctx) error {
	// Get user ID (provider ID) from JWT token via middleware
	providerId, ok := c.Locals("user_id").(string)
	if !ok || providerId == "" {
		return utils.Error(c, 401, "unauthorized: invalid user ID")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Fetch user from MongoDB using provider ID
	userCol := db.Client.Database("storehub").Collection("users")
	var user models.User
	if err := userCol.FindOne(ctx, bson.M{"providerId": providerId}).Decode(&user); err != nil {
		return utils.Error(c, 404, "user not found")
	}

	// Fetch all components belonging to this user
	componentCol := db.Client.Database("storehub").Collection("components")
	cursor, err := componentCol.Find(ctx, bson.M{"ownerId": providerId})
	if err != nil {
		return utils.Error(c, 500, "failed to fetch components")
	}
	defer cursor.Close(ctx)

	var components []models.Component
	if err := cursor.All(ctx, &components); err != nil {
		return utils.Error(c, 500, "failed to decode components")
	}

	// Return complete user profile with components
	return utils.Success(c, fiber.Map{
		"user": fiber.Map{
			"id":         user.ID,
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
		"stats": fiber.Map{
			"totalComponents": len(components),
		},
		"status": "authenticated",
	})
}

// GetProfileById returns complete user details with all their components by provider ID
func GetProfileById(c *fiber.Ctx) error {
	// Get provider ID from URL parameter
	providerId := c.Params("id")
	if providerId == "" {
		return utils.Error(c, 400, "provider ID is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Fetch user from MongoDB using provider ID
	userCol := db.Client.Database("storehub").Collection("users")
	var user models.User
	if err := userCol.FindOne(ctx, bson.M{"providerId": providerId}).Decode(&user); err != nil {
		return utils.Error(c, 404, "user not found")
	}

	// Fetch all components belonging to this user
	componentCol := db.Client.Database("storehub").Collection("components")
	cursor, err := componentCol.Find(ctx, bson.M{"ownerId": providerId})
	if err != nil {
		return utils.Error(c, 500, "failed to fetch components")
	}
	defer cursor.Close(ctx)

	var components []models.Component
	if err := cursor.All(ctx, &components); err != nil {
		return utils.Error(c, 500, "failed to decode components")
	}

	// Return complete user profile with components
	return utils.Success(c, fiber.Map{
		"user": fiber.Map{
			"id":         user.ID,
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
		"stats": fiber.Map{
			"totalComponents": len(components),
		},
	})
}
