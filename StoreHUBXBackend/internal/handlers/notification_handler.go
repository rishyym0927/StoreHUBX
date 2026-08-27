package handlers

import (
	"context"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// GET /api/notifications (protected) - the caller's feed, newest first
func ListNotifications(c *fiber.Ctx) error {
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Pagination
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	skip := (page - 1) * limit

	col := db.Client.Database("storehub").Collection("notifications")
	filter := bson.M{"userId": uid}
	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetSkip(int64(skip)).
		SetLimit(int64(limit))
	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		return utils.Error(c, 500, "database error")
	}
	defer cursor.Close(ctx)

	notifications := make([]models.Notification, 0)
	if err := cursor.All(ctx, &notifications); err != nil {
		return utils.Error(c, 500, "failed to decode notifications")
	}

	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		total = int64(len(notifications)) // fallback
	}

	unread, _ := col.CountDocuments(ctx, bson.M{"userId": uid, "read": false})

	return utils.Success(c, fiber.Map{
		"notifications": notifications,
		"unreadCount":   unread,
		"page":          page,
		"limit":         limit,
		"total":         total,
	})
}

// POST /api/notifications/:id/read (protected)
func MarkNotificationRead(c *fiber.Ctx) error {
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	oid, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return utils.Error(c, 400, "invalid notification id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("notifications")
	res, err := col.UpdateOne(ctx, bson.M{"_id": oid, "userId": uid}, bson.M{"$set": bson.M{"read": true}})
	if err != nil {
		return utils.Error(c, 500, "failed to update notification")
	}
	if res.MatchedCount == 0 {
		return utils.Error(c, 404, "notification not found")
	}

	return utils.Success(c, fiber.Map{"message": "marked as read"})
}

// POST /api/notifications/read-all (protected)
func MarkAllNotificationsRead(c *fiber.Ctx) error {
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("notifications")
	if _, err := col.UpdateMany(ctx, bson.M{"userId": uid, "read": false}, bson.M{"$set": bson.M{"read": true}}); err != nil {
		return utils.Error(c, 500, "failed to update notifications")
	}

	return utils.Success(c, fiber.Map{"message": "all marked as read"})
}
