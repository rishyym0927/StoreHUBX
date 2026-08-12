package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type NotificationType string

const (
	NotificationNewVersion     NotificationType = "new_version"
	NotificationComment        NotificationType = "comment"
	NotificationBuildCompleted NotificationType = "build_completed"
)

// Notification is an in-app event feed entry for a single user.
type Notification struct {
	ID     primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID string             `bson:"userId" json:"userId"`
	Type   NotificationType   `bson:"type" json:"type"`

	ComponentID primitive.ObjectID `bson:"componentId,omitempty" json:"componentId,omitempty"`
	// ComponentSlug is denormalized so the notification feed can link straight
	// to /components/{slug} without a lookup per row. Rows written before this
	// field existed have it empty — consumers must treat it as optional.
	ComponentSlug string `bson:"componentSlug,omitempty" json:"componentSlug,omitempty"`

	Message string `bson:"message" json:"message"`
	Read        bool               `bson:"read" json:"read"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}
