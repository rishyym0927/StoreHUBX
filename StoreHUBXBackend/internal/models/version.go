package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type BuildState string

const (
	VersionBuildNone    BuildState = "none"
	VersionBuildQueued  BuildState = "queued"
	VersionBuildRunning BuildState = "running"
	VersionBuildReady   BuildState = "ready"
	VersionBuildError   BuildState = "error"
)

type ComponentVersion struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ComponentID primitive.ObjectID `bson:"componentId" json:"componentId"`
	Version     string             `bson:"version" json:"version"`
	Changelog   string             `bson:"changelog,omitempty" json:"changelog,omitempty"`
	Readme      string             `bson:"readme,omitempty" json:"readme,omitempty"`
	CodeURL     string             `bson:"codeUrl,omitempty" json:"codeUrl,omitempty"`

	// New for previews:
	PreviewURL string     `bson:"previewUrl,omitempty" json:"previewUrl,omitempty"`
	BuildState BuildState `bson:"buildState,omitempty" json:"buildState,omitempty"`

	// Commit SHA for tracking unique commits
	CommitSHA string `bson:"commitSha" json:"commitSha"`

	CreatedBy string    `bson:"createdBy" json:"createdBy"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}
