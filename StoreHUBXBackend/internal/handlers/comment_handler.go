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

// GET /components/:slug/comments
func GetComments(c *fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Get the component ID by slug
	col := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := col.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	// 2. Fetch its comments
	commentCol := db.Client.Database("storehub").Collection("comments")
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}) // newest first
	cursor, err := commentCol.Find(ctx, bson.M{"componentId": comp.ID}, opts)
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	comments := make([]models.Comment, 0)
	if err := cursor.All(ctx, &comments); err != nil {
		return utils.Error(c, 500, "failed to decode comments")
	}

	return utils.Success(c, fiber.Map{
		"comments": comments,
	})
}

// POST /components/:slug/comments (Protected)
func AddComment(c *fiber.Ctx) error {
	slug := c.Params("slug")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	// Parse content payload
	var payload struct {
		Content string `json:"content"`
	}
	if err := c.BodyParser(&payload); err != nil || payload.Content == "" {
		return utils.Error(c, 400, "comment content cannot be empty")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Get the component
	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	// 2. Create the comment
	newComment := models.Comment{
		ComponentID: comp.ID,
		UserID:      uid,
		Content:     payload.Content,
		CreatedAt:   time.Now(),
	}

	commentCol := db.Client.Database("storehub").Collection("comments")
	res, err := commentCol.InsertOne(ctx, newComment)
	if err != nil {
		return utils.Error(c, 500, "failed to posting comment")
	}

	newComment.ID = res.InsertedID.(primitive.ObjectID)

	return utils.Success(c, fiber.Map{
		"message": "comment added",
		"comment": newComment,
	})
}

// DELETE /components/:slug/comments/:commentId (Protected)
func DeleteComment(c *fiber.Ctx) error {
	commentID := c.Params("commentId")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	objID, err := primitive.ObjectIDFromHex(commentID)
	if err != nil {
		return utils.Error(c, 400, "invalid comment ID")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	commentCol := db.Client.Database("storehub").Collection("comments")

	// Ensure the user trying to delete is the actual author
	res, err := commentCol.DeleteOne(ctx, bson.M{"_id": objID, "userId": uid})
	if err != nil {
		return utils.Error(c, 500, "failed to delete comment")
	}

	if res.DeletedCount == 0 {
		return utils.Error(c, 403, "not authorized to delete this comment or comment not found")
	}

	return utils.Success(c, fiber.Map{
		"message": "comment deleted",
	})
}
