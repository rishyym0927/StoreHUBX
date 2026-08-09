package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ComponentVersion no longer tracks its own build status/preview URL — a
// version's build status is the latest BuildJob for its VersionID
// (internal/handlers/build.go), and BuildJob.Artifacts.BundleURL is the
// single source of truth for the preview URL.
type ComponentVersion struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ComponentID primitive.ObjectID `bson:"componentId" json:"componentId"`
	Version     string             `bson:"version" json:"version"`
	Changelog   string             `bson:"changelog,omitempty" json:"changelog,omitempty"`
	Readme      string             `bson:"readme,omitempty" json:"readme,omitempty"`
	CodeURL     string             `bson:"codeUrl,omitempty" json:"codeUrl,omitempty"`

	// Commit SHA for tracking unique commits
	CommitSHA string `bson:"commitSha" json:"commitSha"`

	CreatedBy string    `bson:"createdBy" json:"createdBy"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}
