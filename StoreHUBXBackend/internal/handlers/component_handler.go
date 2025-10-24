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

	var comp models.Component
	if err := col.FindOne(ctx, bson.M{"slug": slug}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found")
	}

	return utils.Success(c, fiber.Map{
		"component": comp,
	})
}


