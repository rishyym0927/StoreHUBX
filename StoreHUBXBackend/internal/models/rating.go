package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Rating represents a single user's rating/review of a component.
type Rating struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ComponentID    primitive.ObjectID `bson:"componentId" json:"componentId"`
	UserID         string             `bson:"userId" json:"userId"` // Reference to User providerId
	AuthorUsername string             `bson:"authorUsername,omitempty" json:"authorUsername,omitempty"`
	AuthorName     string             `bson:"authorName,omitempty" json:"authorName,omitempty"`
	AuthorAvatar   string             `bson:"authorAvatar,omitempty" json:"authorAvatar,omitempty"`
	Score          int                `bson:"score" json:"score"` // 1-5
	Review         string             `bson:"review" json:"review"`
	CreatedAt      time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time          `bson:"updatedAt" json:"updatedAt"`
}
