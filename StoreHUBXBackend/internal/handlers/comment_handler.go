package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/notify"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// commentView is the stable JSON shape for a comment-type Interaction — the
// external contract is unchanged even though comments now live in the
// shared interactions collection.
type commentView struct {
	ID             primitive.ObjectID `json:"id"`
	ComponentID    primitive.ObjectID `json:"componentId"`
	UserID         string             `json:"userId"`
	AuthorUsername string             `json:"authorUsername,omitempty"`
	AuthorName     string             `json:"authorName,omitempty"`
	AuthorAvatar   string             `json:"authorAvatar,omitempty"`
	Content        string             `json:"content"`
	CreatedAt      time.Time          `json:"createdAt"`
}

func toCommentView(i models.Interaction) commentView {
	return commentView{
		ID:             i.ID,
		ComponentID:    i.ComponentID,
		UserID:         i.UserID,
		AuthorUsername: i.AuthorUsername,
		AuthorName:     i.AuthorName,
		AuthorAvatar:   i.AuthorAvatar,
		Content:        i.Content,
		CreatedAt:      i.CreatedAt,
	}
}

// GET /components/:slug/comments
func GetComments(c *fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	interactionCol := db.Client.Database("storehub").Collection("interactions")
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}) // newest first
	cursor, err := interactionCol.Find(ctx, bson.M{"componentId": comp.ID, "type": models.InteractionComment}, opts)
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	interactions := make([]models.Interaction, 0)
	if err := cursor.All(ctx, &interactions); err != nil {
		return utils.Error(c, 500, "failed to decode comments")
	}

	comments := make([]commentView, 0, len(interactions))
	for _, i := range interactions {
		comments = append(comments, toCommentView(i))
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

	var payload struct {
		Content string `json:"content"`
	}
	if err := c.BodyParser(&payload); err != nil || payload.Content == "" {
		return utils.Error(c, 400, "comment content cannot be empty")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	userCol := db.Client.Database("storehub").Collection("users")
	var author models.User
	if err := userCol.FindOne(ctx, bson.M{"providerId": uid}).Decode(&author); err != nil {
		return utils.Error(c, 404, "user not found")
	}

	newComment := models.Interaction{
		ComponentID:    comp.ID,
		UserID:         uid,
		Type:           models.InteractionComment,
		AuthorUsername: author.Username,
		AuthorName:     author.Name,
		AuthorAvatar:   author.AvatarURL,
		Content:        payload.Content,
		CreatedAt:      time.Now(),
	}

	interactionCol := db.Client.Database("storehub").Collection("interactions")
	res, err := interactionCol.InsertOne(ctx, newComment)
	if err != nil {
		return utils.Error(c, 500, "failed to posting comment")
	}

	newComment.ID = res.InsertedID.(primitive.ObjectID)

	if comp.OwnerID != "" && comp.OwnerID != uid {
		notify.Comment(ctx, comp.OwnerID, comp.ID, comp.Name, author.Name)
	}

	return utils.Success(c, fiber.Map{
		"message": "comment added",
		"comment": toCommentView(newComment),
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

	interactionCol := db.Client.Database("storehub").Collection("interactions")

	// Ensure the user trying to delete is the actual author
	res, err := interactionCol.DeleteOne(ctx, bson.M{"_id": objID, "userId": uid, "type": models.InteractionComment})
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
