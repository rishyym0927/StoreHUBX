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

	// Social & Analytics — durable counters, kept in sync via $inc rather
	// than recomputed from an embedded array at read time.
	LikeCount int  `bson:"likeCount" json:"likeCount"`
	LikedByMe bool `bson:"-" json:"likedByMe,omitempty"` // response-only, populated per-viewer by GetComponent
	ViewCount int  `bson:"viewCount" json:"viewCount"`

	AverageRating float64 `bson:"averageRating" json:"averageRating"`
	RatingCount   int     `bson:"ratingCount" json:"ratingCount"`

	Visibility    string   `bson:"visibility" json:"visibility"` // "public" | "private"
	Collaborators []string `bson:"collaborators" json:"collaborators"`

	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
}

type RepoLink struct {
	Owner         string `bson:"owner" json:"owner"`
	Repo          string `bson:"repo" json:"repo"`
	Path          string `bson:"path" json:"path"`     // folder where component lives
	Ref           string `bson:"ref" json:"ref"`       // branch/tag
	Commit        string `bson:"commit" json:"commit"` // optional pinned sha
	WebhookSecret string `bson:"webhookSecret,omitempty" json:"-"`
}

// AsBuildRepo converts to the shape BuildJob.Repo expects, dropping the webhook secret.
func (r RepoLink) AsBuildRepo() BuildRepo {
	return BuildRepo{Owner: r.Owner, Repo: r.Repo, Path: r.Path, Ref: r.Ref, Commit: r.Commit}
}
