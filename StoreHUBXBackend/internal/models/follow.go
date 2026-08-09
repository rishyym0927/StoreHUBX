package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type FollowTargetType string

const (
	FollowTargetUser      FollowTargetType = "user"
	FollowTargetComponent FollowTargetType = "component"
)

// Follow lets a user follow either another user or a component. TargetID
// holds the followed user's providerId or the followed component's
// ObjectID hex, depending on TargetType.
type Follow struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	FollowerID string             `bson:"followerId" json:"followerId"`
	TargetType FollowTargetType   `bson:"targetType" json:"targetType"`
	TargetID   string             `bson:"targetId" json:"targetId"`
	CreatedAt  time.Time          `bson:"createdAt" json:"createdAt"`
}
