package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

type followPayload struct {
	TargetType string `json:"targetType"`
	TargetID   string `json:"targetId"`
}

// Only component follows are accepted. models.FollowTargetUser still exists
// and the storage shape supports it, but nothing consumes it: notify.NewVersion
// fans out on {targetType: component} alone, so a user follow would store a row
// that can never produce a notification. To re-enable it, make notify also fan
// out to followers of the component's OwnerID, then allow the type here.
func (p followPayload) valid() bool {
	if p.TargetID == "" {
		return false
	}
	return p.TargetType == string(models.FollowTargetComponent)
}

// POST /api/follows (protected) - body: {targetType: "user"|"component", targetId}
func CreateFollow(c *fiber.Ctx) error {
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	var payload followPayload
	if err := c.BodyParser(&payload); err != nil || !payload.valid() {
		return utils.Error(c, 400, "targetType must be component, and targetId is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	followCol := db.Client.Database("storehub").Collection("follows")
	_, err := followCol.InsertOne(ctx, models.Follow{
		FollowerID: uid,
		TargetType: models.FollowTargetType(payload.TargetType),
		TargetID:   payload.TargetID,
		CreatedAt:  time.Now(),
	})
	if mongo.IsDuplicateKeyError(err) {
		return utils.Success(c, fiber.Map{"message": "already following"})
	}
	if err != nil {
		return utils.Error(c, 500, "failed to follow")
	}

	return utils.Success(c, fiber.Map{"message": "followed"})
}

// DELETE /api/follows (protected) - body: {targetType: "user"|"component", targetId}
func DeleteFollow(c *fiber.Ctx) error {
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	var payload followPayload
	if err := c.BodyParser(&payload); err != nil || !payload.valid() {
		return utils.Error(c, 400, "targetType must be component, and targetId is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	followCol := db.Client.Database("storehub").Collection("follows")
	res, err := followCol.DeleteOne(ctx, bson.M{
		"followerId": uid,
		"targetType": payload.TargetType,
		"targetId":   payload.TargetID,
	})
	if err != nil {
		return utils.Error(c, 500, "failed to unfollow")
	}
	if res.DeletedCount == 0 {
		return utils.Error(c, 404, "not following")
	}

	return utils.Success(c, fiber.Map{"message": "unfollowed"})
}
