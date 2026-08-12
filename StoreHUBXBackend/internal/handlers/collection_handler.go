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

	col := db.Client.Database("storehub").Collection("collections")
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

	col := db.Client.Database("storehub").Collection("collections")
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

// GET /collections/:id (public; OptionalAuth reveals the caller's own private collection)
//
// Returns the collection together with its components resolved, since
// Collection.ComponentIDs is only a list of ObjectIDs and the client has no
// other way to turn those into anything renderable.
func GetCollection(c *fiber.Ctx) error {
	collID, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return utils.Error(c, 400, "invalid collection id")
	}
	viewerID, _ := c.Locals("user_id").(string)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var collection models.Collection
	col := db.Client.Database("storehub").Collection("collections")
	if err := col.FindOne(ctx, bson.M{"_id": collID}).Decode(&collection); err != nil {
		return utils.Error(c, 404, "collection not found")
	}

	// A private collection is a 404 rather than a 403 for non-owners, matching
	// how GetComponent hides private components.
	if collection.Visibility == "private" && viewerID != collection.OwnerID {
		return utils.Error(c, 404, "collection not found")
	}

	components := make([]models.Component, 0)
	if len(collection.ComponentIDs) > 0 {
		// A component can be added to a collection and then made private, so
		// re-apply the per-viewer visibility rule here instead of trusting
		// membership — the owner/collaborators still see their own.
		filter := bson.M{"_id": bson.M{"$in": collection.ComponentIDs}}
		if viewerID == "" {
			filter["visibility"] = bson.M{"$ne": "private"}
		} else {
			filter["$or"] = []bson.M{
				{"visibility": bson.M{"$ne": "private"}},
				{"ownerId": viewerID},
				{"collaborators": viewerID},
			}
		}

		compCol := db.Client.Database("storehub").Collection("components")
		cursor, err := compCol.Find(ctx, filter)
		if err != nil {
			return utils.Error(c, 500, "database error")
		}
		defer cursor.Close(ctx)
		if err := cursor.All(ctx, &components); err != nil {
			return utils.Error(c, 500, "failed to decode components")
		}
	}

	return utils.Success(c, fiber.Map{
		"collection": collection,
		"components": components,
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

	col := db.Client.Database("storehub").Collection("collections")
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

	col := db.Client.Database("storehub").Collection("collections")
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
