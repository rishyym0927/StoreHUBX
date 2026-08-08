package handlers

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

//
// POST /api/components  (protected)
//
func CreateComponent(c *fiber.Ctx) error {
	var body models.Component
	if err := c.BodyParser(&body); err != nil {
		return utils.Error(c, 400, "invalid JSON body")
	}
	if body.Name == "" || len(body.Frameworks) == 0 {
		return utils.Error(c, 400, "component name and frameworks are required")
	}

	uid, _ := c.Locals("user_id").(string)
	body.OwnerID = uid
	now := time.Now()
	body.CreatedAt = now
	body.UpdatedAt = now
	body.Slug = strings.ToLower(strings.ReplaceAll(body.Name, " ", "-"))
	body.LikedBy = []string{}
	body.UniqueVisitors = []string{}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")
	if _, err := col.InsertOne(ctx, body); err != nil {
		return utils.Error(c, 500, "failed to insert component")
	}

	return utils.Success(c, fiber.Map{
		"status":    "created",
		"component": body,
	})
}

//
// GET /components  (public)  with q, framework, tags, page, limit
//
func GetAllComponents(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")

	// Pagination
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 10
	}
	skip := (page - 1) * limit

	// Filters
	q := strings.TrimSpace(c.Query("q", ""))
	framework := strings.TrimSpace(strings.ToLower(c.Query("framework", "")))
	tagsParam := strings.TrimSpace(c.Query("tags", "")) // "ui,button,react"

	filter := bson.M{}
	if q != "" {
		filter["$or"] = []bson.M{
			{"name": bson.M{"$regex": q, "$options": "i"}},
			{"description": bson.M{"$regex": q, "$options": "i"}},
			{"tags": bson.M{"$elemMatch": bson.M{"$regex": q, "$options": "i"}}},
		}
	}
	if framework != "" {
		filter["frameworks"] = framework
	}
	if tagsParam != "" {
		raw := strings.Split(tagsParam, ",")
		tags := make([]string, 0, len(raw))
		for _, t := range raw {
			if tt := strings.TrimSpace(strings.ToLower(t)); tt != "" {
				tags = append(tags, tt)
			}
		}
		if len(tags) > 0 {
			filter["tags"] = bson.M{"$all": tags}
		}
	}

	opts := options.Find().
		SetSkip(int64(skip)).
		SetLimit(int64(limit)).
		SetSort(bson.D{{Key: "createdAt", Value: -1}}) // newest first

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	// IMPORTANT: pre-init so it marshals as [] not null
	components := make([]models.Component, 0, limit)
	if err := cursor.All(ctx, &components); err != nil {
		return utils.Error(c, 500, "failed to decode components")
	}

	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		total = int64(len(components)) // fallback
	}

	return utils.Success(c, fiber.Map{
		"page":       page,
		"limit":      limit,
		"total":      total,
		"components": components, // [] when empty
	})
}

//
// GET /components/:slug  (public)
//
func GetComponent(c *fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")

	visitorID := c.IP()
	if uid, ok := c.Locals("user_id").(string); ok && uid != "" {
		visitorID = uid
	}
	if visitorID == "" {
		visitorID = "anonymous"
	}

	updateParams := bson.M{
		"$addToSet": bson.M{"uniqueVisitors": visitorID},
	}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)

	var comp models.Component
	if err := col.FindOneAndUpdate(ctx, bson.M{"slug": slug}, updateParams, opts).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	// Ensure viewCount accurately reflects unique visitors
	comp.ViewCount = len(comp.UniqueVisitors)

	return utils.Success(c, fiber.Map{
		"component": comp,
	})
}

//
// POST /components/:slug/like (Protected)
//
func ToggleLikeComponent(c *fiber.Ctx) error {
	slug := c.Params("slug")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")

	// Check if already liked by this user
	var comp models.Component
	err := col.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	isLiked := false
	for _, id := range comp.LikedBy {
		if id == uid {
			isLiked = true
			break
		}
	}

	var updateParams bson.M
	if isLiked {
		// Unlike
		updateParams = bson.M{
			"$pull": bson.M{"likedBy": uid},
			"$inc":  bson.M{"likeCount": -1},
		}
	} else {
		// Like
		updateParams = bson.M{
			"$addToSet": bson.M{"likedBy": uid},
			"$inc":      bson.M{"likeCount": 1},
		}
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updatedComp models.Component
	if err := col.FindOneAndUpdate(ctx, bson.M{"slug": slug}, updateParams, opts).Decode(&updatedComp); err != nil {
		return utils.Error(c, 500, "failed to update like status")
	}

	return utils.Success(c, fiber.Map{
		"message":   "like toggled",
		"component": updatedComp,
	})
}


