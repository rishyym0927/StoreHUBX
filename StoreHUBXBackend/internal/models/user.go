package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string             `bson:"name" json:"name"`
	Email     string             `bson:"email" json:"email"`
	Username  string             `bson:"username" json:"username"`
	AvatarURL string             `bson:"avatarUrl" json:"avatarUrl"`
	Provider  string             `bson:"provider" json:"provider"`
	ProviderID string            `bson:"providerId" json:"providerId"`
	AccessToken string    `bson:"accessToken,omitempty" json:"-"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}
