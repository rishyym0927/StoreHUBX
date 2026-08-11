// Package notify creates Notification documents. It only depends on
// db/models so both handlers and worker can call it without an import cycle.
package notify

import (
	"context"
	"fmt"
	"time"

	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func insert(ctx context.Context, n models.Notification) {
	n.CreatedAt = time.Now()
	col := db.DB().Collection("notifications")
	_, _ = col.InsertOne(ctx, n)
}

// NewVersion notifies everyone following componentID that a new version was published.
func NewVersion(ctx context.Context, componentID primitive.ObjectID, componentName, versionStr string) {
	followCol := db.DB().Collection("follows")
	cursor, err := followCol.Find(ctx, bson.M{"targetType": models.FollowTargetComponent, "targetId": componentID.Hex()})
	if err != nil {
		return
	}
	defer cursor.Close(ctx)

	var follows []models.Follow
	if err := cursor.All(ctx, &follows); err != nil {
		return
	}

	msg := fmt.Sprintf("%s published a new version: %s", componentName, versionStr)
	for _, f := range follows {
		insert(ctx, models.Notification{
			UserID:      f.FollowerID,
			Type:        models.NotificationNewVersion,
			ComponentID: componentID,
			Message:     msg,
		})
	}
}

// Comment notifies a component's owner that someone commented on it.
func Comment(ctx context.Context, ownerID string, componentID primitive.ObjectID, componentName, commenterName string) {
	insert(ctx, models.Notification{
		UserID:      ownerID,
		Type:        models.NotificationComment,
		ComponentID: componentID,
		Message:     fmt.Sprintf("%s commented on %s", commenterName, componentName),
	})
}

// BuildCompleted notifies the actor who triggered a build that it finished.
func BuildCompleted(ctx context.Context, ownerID string, componentID primitive.ObjectID, componentSlug, versionStr string, success bool) {
	if ownerID == "" {
		return
	}
	status := "succeeded"
	if !success {
		status = "failed"
	}
	insert(ctx, models.Notification{
		UserID:      ownerID,
		Type:        models.NotificationBuildCompleted,
		ComponentID: componentID,
		Message:     fmt.Sprintf("Build %s for %s v%s", status, componentSlug, versionStr),
	})
}
