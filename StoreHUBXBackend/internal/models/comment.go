package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Comment represents a user's comment on a specific component
type Comment struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ComponentID primitive.ObjectID `bson:"componentId" json:"componentId"`
	UserID      string             `bson:"userId" json:"userId"` // Reference to User providerId
	Content     string             `bson:"content" json:"content"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}
