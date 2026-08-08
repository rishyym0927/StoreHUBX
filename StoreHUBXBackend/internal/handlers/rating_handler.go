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

// recalculateRatingStats aggregates all ratings for a component and writes
// the denormalized averageRating/ratingCount back onto the component doc.
func recalculateRatingStats(ctx context.Context, componentID primitive.ObjectID) error {
	ratingCol := db.Client.Database("storehub").Collection("ratings")

	pipeline := []bson.M{
		{"$match": bson.M{"componentId": componentID}},
		{"$group": bson.M{
			"_id":   nil,
			"avg":   bson.M{"$avg": "$score"},
			"count": bson.M{"$sum": 1},
		}},
	}

	cursor, err := ratingCol.Aggregate(ctx, pipeline)
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

	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	userCol := db.Client.Database("storehub").Collection("users")
	var author models.User
	if err := userCol.FindOne(ctx, bson.M{"providerId": uid}).Decode(&author); err != nil {
		return utils.Error(c, 404, "user not found")
	}

	ratingCol := db.Client.Database("storehub").Collection("ratings")
	now := time.Now()
	update := bson.M{
		"$set": bson.M{
			"score":          payload.Score,
			"review":         payload.Review,
			"authorUsername": author.Username,
			"authorName":     author.Name,
			"authorAvatar":   author.AvatarURL,
			"updatedAt":      now,
		},
		"$setOnInsert": bson.M{
			"componentId": comp.ID,
			"userId":      uid,
			"createdAt":   now,
		},
	}
	opts := options.Update().SetUpsert(true)
	if _, err := ratingCol.UpdateOne(ctx, bson.M{"componentId": comp.ID, "userId": uid}, update, opts); err != nil {
		return utils.Error(c, 500, "failed to save rating")
	}

	if err := recalculateRatingStats(ctx, comp.ID); err != nil {
		return utils.Error(c, 500, "failed to update rating stats")
	}
	invalidateComponentCaches(ctx, slug)

	var saved models.Rating
	if err := ratingCol.FindOne(ctx, bson.M{"componentId": comp.ID, "userId": uid}).Decode(&saved); err != nil {
		return utils.Error(c, 500, "failed to load saved rating")
	}

	return utils.Success(c, fiber.Map{
		"message": "rating saved",
		"rating":  saved,
	})
}

// GET /components/:slug/ratings (public)
func ListRatings(c *fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	ratingCol := db.Client.Database("storehub").Collection("ratings")
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}})
	cursor, err := ratingCol.Find(ctx, bson.M{"componentId": comp.ID}, opts)
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	ratings := make([]models.Rating, 0)
	if err := cursor.All(ctx, &ratings); err != nil {
		return utils.Error(c, 500, "failed to decode ratings")
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

	compCol := db.Client.Database("storehub").Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	ratingCol := db.Client.Database("storehub").Collection("ratings")
	res, err := ratingCol.DeleteOne(ctx, bson.M{"componentId": comp.ID, "userId": uid})
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
