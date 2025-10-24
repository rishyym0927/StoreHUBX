package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Component struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name        string             `bson:"name" json:"name"`
	Slug        string             `bson:"slug" json:"slug"`
	Description string             `bson:"description" json:"description"`
	Frameworks  []string           `bson:"frameworks" json:"frameworks"`
	Tags        []string           `bson:"tags" json:"tags"`
	License     string             `bson:"license" json:"license"`
	OwnerID     string             `bson:"ownerId" json:"ownerId"`
	RepoLink    RepoLink           `bson:"repoLink" json:"repoLink"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
	// add version  now from version model
	

}

type RepoLink struct {
	Owner  string `bson:"owner" json:"owner"`
	Repo   string `bson:"repo" json:"repo"`
	Path   string `bson:"path" json:"path"`     // folder where component lives
	Ref    string `bson:"ref" json:"ref"`       // branch/tag
	Commit string `bson:"commit" json:"commit"` // optional pinned sha
}
