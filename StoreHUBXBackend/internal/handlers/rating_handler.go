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

// ratingView is the stable JSON shape for a rating-type Interaction — the
// external contract is unchanged even though ratings now live in the shared
// interactions collection (Interaction.Content holds the review text).
type ratingView struct {
	ID             primitive.ObjectID `json:"id"`
	ComponentID    primitive.ObjectID `json:"componentId"`
	UserID         string             `json:"userId"`
	AuthorUsername string             `json:"authorUsername,omitempty"`
	AuthorName     string             `json:"authorName,omitempty"`
	AuthorAvatar   string             `json:"authorAvatar,omitempty"`
	Score          int                `json:"score"`
	Review         string             `json:"review"`
	CreatedAt      time.Time          `json:"createdAt"`
	UpdatedAt      time.Time          `json:"updatedAt"`
}

func toRatingView(i models.Interaction) ratingView {
	return ratingView{
		ID:             i.ID,
		ComponentID:    i.ComponentID,
		UserID:         i.UserID,
		AuthorUsername: i.AuthorUsername,
		AuthorName:     i.AuthorName,
		AuthorAvatar:   i.AuthorAvatar,
		Score:          i.Score,
		Review:         i.Content,
		CreatedAt:      i.CreatedAt,
		UpdatedAt:      i.UpdatedAt,
	}
}

// recalculateRatingStats aggregates all ratings for a component and writes
// the denormalized averageRating/ratingCount back onto the component doc.
func recalculateRatingStats(ctx context.Context, componentID primitive.ObjectID) error {
	interactionCol := db.Client.Database("storehub").Collection("interactions")

	pipeline := []bson.M{
		{"$match": bson.M{"componentId": componentID, "type": models.InteractionRating}},
		{"$group": bson.M{
			"_id":   nil,
			"avg":   bson.M{"$avg": "$score"},
			"count": bson.M{"$sum": 1},
		}},
	}

	cursor, err := interactionCol.Aggregate(ctx, pipeline)
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	var result struct {
		Avg   float64 `bson:"avg"`
		Count int     `bson:"count"`
	}
	if cursor.Next(ctx) {
		if err := cursor.Decode(&result); err != nil {
			return err
		}
	}

	compCol := db.Client.Database("storehub").Collection("components")
	_, err = compCol.UpdateOne(ctx, bson.M{"_id": componentID}, bson.M{
		"$set": bson.M{"averageRating": result.Avg, "ratingCount": result.Count},
	})
	return err
}

// POST /api/components/:slug/ratings (Protected) - upsert the caller's rating
func UpsertRating(c *fiber.Ctx) error {
	slug := c.Params("slug")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	var payload struct {
		Score  int    `json:"score"`
		Review string `json:"review"`
	}
	if err := c.BodyParser(&payload); err != nil || payload.Score < 1 || payload.Score > 5 {
		return utils.Error(c, 400, "score must be between 1 and 5")
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

	interactionCol := db.Client.Database("storehub").Collection("interactions")
	now := time.Now()
	filter := bson.M{"componentId": comp.ID, "userId": uid, "type": models.InteractionRating}
	update := bson.M{
		"$set": bson.M{
			"score":          payload.Score,
			"content":        payload.Review,
			"authorUsername": author.Username,
			"authorName":     author.Name,
			"authorAvatar":   author.AvatarURL,
			"updatedAt":      now,
		},
		"$setOnInsert": bson.M{
			"componentId": comp.ID,
			"userId":      uid,
			"type":        models.InteractionRating,
			"createdAt":   now,
		},
	}
	opts := options.Update().SetUpsert(true)
	if _, err := interactionCol.UpdateOne(ctx, filter, update, opts); err != nil {
		return utils.Error(c, 500, "failed to save rating")
	}

	if err := recalculateRatingStats(ctx, comp.ID); err != nil {
		return utils.Error(c, 500, "failed to update rating stats")
	}
	invalidateComponentCaches(ctx, slug)

	var saved models.Interaction
	if err := interactionCol.FindOne(ctx, filter).Decode(&saved); err != nil {
		return utils.Error(c, 500, "failed to load saved rating")
	}

	return utils.Success(c, fiber.Map{
		"message": "rating saved",
		"rating":  toRatingView(saved),
	})
}

// GET /components/:slug/ratings (public)
func ListRatings(c *fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	interactionCol := db.Client.Database("storehub").Collection("interactions")
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}})
	cursor, err := interactionCol.Find(ctx, bson.M{"componentId": comp.ID, "type": models.InteractionRating}, opts)
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	interactions := make([]models.Interaction, 0)
	if err := cursor.All(ctx, &interactions); err != nil {
		return utils.Error(c, 500, "failed to decode ratings")
	}

	ratings := make([]ratingView, 0, len(interactions))
	for _, i := range interactions {
		ratings = append(ratings, toRatingView(i))
	}

	return utils.Success(c, fiber.Map{
		"ratings":       ratings,
		"averageRating": comp.AverageRating,
		"ratingCount":   comp.RatingCount,
	})
}

// DELETE /api/components/:slug/ratings (Protected) - removes the caller's own rating
func DeleteRating(c *fiber.Ctx) error {
	slug := c.Params("slug")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	interactionCol := db.Client.Database("storehub").Collection("interactions")
	res, err := interactionCol.DeleteOne(ctx, bson.M{"componentId": comp.ID, "userId": uid, "type": models.InteractionRating})
	if err != nil {
		return utils.Error(c, 500, "failed to delete rating")
	}
	if res.DeletedCount == 0 {
		return utils.Error(c, 404, "rating not found")
	}

	if err := recalculateRatingStats(ctx, comp.ID); err != nil {
		return utils.Error(c, 500, "failed to update rating stats")
	}
	invalidateComponentCaches(ctx, slug)

	return utils.Success(c, fiber.Map{"message": "rating deleted"})
}
