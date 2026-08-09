package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Collection is a user-curated group of components.
type Collection struct {
	ID           primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	OwnerID      string               `bson:"ownerId" json:"ownerId"`
	Name         string               `bson:"name" json:"name"`
	Description  string               `bson:"description,omitempty" json:"description,omitempty"`
	ComponentIDs []primitive.ObjectID `bson:"componentIds" json:"componentIds"`
	Visibility   string               `bson:"visibility" json:"visibility"` // "public" | "private"
	CreatedAt    time.Time            `bson:"createdAt" json:"createdAt"`
	UpdatedAt    time.Time            `bson:"updatedAt" json:"updatedAt"`
}
