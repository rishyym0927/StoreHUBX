package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type InteractionType string

const (
	InteractionLike    InteractionType = "like"
	InteractionRating  InteractionType = "rating"
	InteractionComment InteractionType = "comment"
)

// Interaction is the single collection backing likes, ratings, and comments.
// Author-snapshot fields are written once at creation and trusted at read
// time (never re-fetched from users per item).
type Interaction struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ComponentID    primitive.ObjectID `bson:"componentId" json:"componentId"`
	UserID         string             `bson:"userId" json:"userId"`
	Type           InteractionType    `bson:"type" json:"type"`
	AuthorUsername string             `bson:"authorUsername,omitempty" json:"authorUsername,omitempty"`
	AuthorName     string             `bson:"authorName,omitempty" json:"authorName,omitempty"`
	AuthorAvatar   string             `bson:"authorAvatar,omitempty" json:"authorAvatar,omitempty"`
	Score          int                `bson:"score,omitempty" json:"score,omitempty"`     // rating only
	Content        string             `bson:"content,omitempty" json:"content,omitempty"` // comment text, or rating review text
	CreatedAt      time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time          `bson:"updatedAt,omitempty" json:"updatedAt,omitempty"`
}
