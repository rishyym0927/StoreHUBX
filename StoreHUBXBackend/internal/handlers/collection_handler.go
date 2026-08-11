package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// POST /api/collections (protected)
func CreateCollection(c *fiber.Ctx) error {
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Visibility  string `json:"visibility"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return utils.Error(c, 400, "collection name is required")
	}

	visibility := "public"
	if body.Visibility == "private" {
		visibility = "private"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := models.Collection{
		OwnerID:      uid,
		Name:         body.Name,
		Description:  body.Description,
		ComponentIDs: []primitive.ObjectID{},
		Visibility:   visibility,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	col := db.DB().Collection("collections")
	res, err := col.InsertOne(ctx, collection)
	if err != nil {
		return utils.Error(c, 500, "failed to create collection")
	}
	collection.ID = res.InsertedID.(primitive.ObjectID)

	return utils.Success(c, fiber.Map{
		"status":     "created",
		"collection": collection,
	})
}

// GET /users/:id/collections (public; OptionalAuth reveals the caller's own private collections)
func ListUserCollections(c *fiber.Ctx) error {
	ownerID := c.Params("id")
	if ownerID == "" {
		return utils.Error(c, 400, "missing user id")
	}
	viewerID, _ := c.Locals("user_id").(string)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"ownerId": ownerID}
	if viewerID != ownerID {
		filter["visibility"] = bson.M{"$ne": "private"}
	}

	col := db.DB().Collection("collections")
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}})
	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	collections := make([]models.Collection, 0)
	if err := cursor.All(ctx, &collections); err != nil {
		return utils.Error(c, 500, "failed to decode collections")
	}

	return utils.Success(c, fiber.Map{
		"collections": collections,
	})
}

// POST /api/collections/:id/components/:componentId (protected, owner only)
func AddComponentToCollection(c *fiber.Ctx) error {
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	collID, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return utils.Error(c, 400, "invalid collection id")
	}
	componentID, err := primitive.ObjectIDFromHex(c.Params("componentId"))
	if err != nil {
		return utils.Error(c, 400, "invalid component id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.DB().Collection("collections")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated models.Collection
	err = col.FindOneAndUpdate(ctx,
		bson.M{"_id": collID, "ownerId": uid},
		bson.M{
			"$addToSet": bson.M{"componentIds": componentID},
			"$set":      bson.M{"updatedAt": time.Now()},
		},
		opts,
	).Decode(&updated)
	if err != nil {
		return utils.Error(c, 404, "collection not found or not owned by you")
	}

	return utils.Success(c, fiber.Map{
		"collection": updated,
	})
}

// DELETE /api/collections/:id/components/:componentId (protected, owner only)
func RemoveComponentFromCollection(c *fiber.Ctx) error {
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	collID, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return utils.Error(c, 400, "invalid collection id")
	}
	componentID, err := primitive.ObjectIDFromHex(c.Params("componentId"))
	if err != nil {
		return utils.Error(c, 400, "invalid component id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.DB().Collection("collections")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated models.Collection
	err = col.FindOneAndUpdate(ctx,
		bson.M{"_id": collID, "ownerId": uid},
		bson.M{
			"$pull": bson.M{"componentIds": componentID},
			"$set":  bson.M{"updatedAt": time.Now()},
		},
		opts,
	).Decode(&updated)
	if err != nil {
		return utils.Error(c, 404, "collection not found or not owned by you")
	}

	return utils.Success(c, fiber.Map{
		"collection": updated,
	})
}
