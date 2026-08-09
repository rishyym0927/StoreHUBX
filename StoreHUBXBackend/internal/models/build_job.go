package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type BuildStatus string

const (
	BuildQueued  BuildStatus = "queued"
	BuildRunning BuildStatus = "running"
	BuildSuccess BuildStatus = "success"
	BuildError   BuildStatus = "error"
)

type BuildArtifact struct {
	BundleURL string `bson:"bundleUrl" json:"bundleUrl"` // public URL (S3/R2/MinIO)
}

type BuildRepo struct {
	Owner  string `bson:"owner" json:"owner"`
	Repo   string `bson:"repo" json:"repo"`
	Path   string `bson:"path" json:"path"`
	Ref    string `bson:"ref" json:"ref"`
	Commit string `bson:"commit" json:"commit"` // optional pinned sha
}

type BuildJob struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ComponentID primitive.ObjectID `bson:"componentId" json:"componentId"`
	VersionID   primitive.ObjectID `bson:"versionId,omitempty" json:"versionId,omitempty"` // FK to the ComponentVersion this job builds
	Component   string             `bson:"component" json:"component"`                     // slug (for convenience)
	Version     string             `bson:"version" json:"version"`                         // e.g., "0.1.0"
	Status      BuildStatus        `bson:"status" json:"status"`                           // queued|running|success|error
	OwnerID     string             `bson:"ownerId" json:"ownerId"`                         // from JWT (providerId)
	Repo        BuildRepo          `bson:"repo" json:"repo"`
	Artifacts   *BuildArtifact     `bson:"artifacts,omitempty" json:"artifacts,omitempty"`
	Logs        []string           `bson:"logs,omitempty" json:"logs,omitempty"`

	Attempts    int `bson:"attempts" json:"attempts"`       // number of failed attempts so far
	MaxAttempts int `bson:"maxAttempts" json:"maxAttempts"` // give up and set status=error after this many failures

	CreatedAt     time.Time  `bson:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time  `bson:"updatedAt" json:"updatedAt"`
	StartedAt     *time.Time `bson:"startedAt,omitempty" json:"startedAt,omitempty"`
	EndedAt       *time.Time `bson:"endedAt,omitempty" json:"endedAt,omitempty"`
	NextAttemptAt *time.Time `bson:"nextAttemptAt,omitempty" json:"nextAttemptAt,omitempty"` // set when retrying after backoff
}
