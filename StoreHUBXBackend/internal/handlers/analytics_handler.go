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

type componentAnalytics struct {
	ID            string  `json:"id"`
	Slug          string  `json:"slug"`
	Name          string  `json:"name"`
	ViewCount     int     `json:"viewCount"`
	LikeCount     int     `json:"likeCount"`
	AverageRating float64 `json:"averageRating"`
	RatingCount   int     `json:"ratingCount"`
	CommentCount  int64   `json:"commentCount"`
}

// GET /api/me/analytics (protected)
// Aggregates view/like/rating/comment totals for every component the caller owns.
func GetOwnerAnalytics(c *fiber.Ctx) error {
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	compCol := db.Client.Database("storehub").Collection("components")
	cursor, err := compCol.Find(ctx, bson.M{"ownerId": uid})
	if err != nil {
		return utils.Error(c, 500, "failed to fetch components")
	}
	defer cursor.Close(ctx)

	components := make([]models.Component, 0)
	if err := cursor.All(ctx, &components); err != nil {
		return utils.Error(c, 500, "failed to decode components")
	}

	interactionCol := db.Client.Database("storehub").Collection("interactions")

	results := make([]componentAnalytics, 0, len(components))
	totalViews, totalLikes, totalComments := 0, 0, int64(0)

	for _, comp := range components {
		commentCount, _ := interactionCol.CountDocuments(ctx, bson.M{"componentId": comp.ID, "type": models.InteractionComment})

		results = append(results, componentAnalytics{
			ID:            comp.ID.Hex(),
			Slug:          comp.Slug,
			Name:          comp.Name,
			ViewCount:     comp.ViewCount,
			LikeCount:     comp.LikeCount,
			AverageRating: comp.AverageRating,
			RatingCount:   comp.RatingCount,
			CommentCount:  commentCount,
		})

		totalViews += comp.ViewCount
		totalLikes += comp.LikeCount
		totalComments += commentCount
	}

	return utils.Success(c, fiber.Map{
		"components": results,
		"totals": fiber.Map{
			"componentCount": len(components),
			"viewCount":      totalViews,
			"likeCount":      totalLikes,
			"commentCount":   totalComments,
		},
	})
}
