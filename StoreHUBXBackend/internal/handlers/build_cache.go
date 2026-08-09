package handlers

import (
	"context"
	"time"

	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// findCachedBuild looks for the most recent successful BuildJob for this
// component from the same commit SHA. If found, its bundle URL can be
// reused instead of re-running the full build pipeline for another version
// that happens to point at an identical commit.
func findCachedBuild(ctx context.Context, componentID primitive.ObjectID, commitSHA string) (*models.BuildJob, bool) {
	if commitSHA == "" {
		return nil, false
	}

	jobCol := db.Client.Database("storehub").Collection("build_jobs")
	opts := options.FindOne().SetSort(bson.D{{Key: "createdAt", Value: -1}})
	var cached models.BuildJob
	err := jobCol.FindOne(ctx, bson.M{
		"componentId": componentID,
		"repo.commit": commitSHA,
		"status":      models.BuildSuccess,
	}, opts).Decode(&cached)
	if err != nil || cached.Artifacts == nil || cached.Artifacts.BundleURL == "" {
		return nil, false
	}
	return &cached, true
}

// reuseCachedBuild records a synthetic, already-succeeded BuildJob for
// newVersionID that points at an existing successful build's artifacts,
// instead of re-running the pipeline for a commit this component has
// already built. This keeps "latest BuildJob for a version" the single
// source of truth for build/preview status even on the cache-hit path.
func reuseCachedBuild(ctx context.Context, cached *models.BuildJob, componentID, newVersionID primitive.ObjectID, componentSlug, versionStr, ownerID string) {
	now := time.Now()
	job := models.BuildJob{
		ComponentID: componentID,
		VersionID:   newVersionID,
		Component:   componentSlug,
		Version:     versionStr,
		Status:      models.BuildSuccess,
		OwnerID:     ownerID,
		Repo:        cached.Repo,
		Artifacts:   cached.Artifacts,
		Logs:        []string{"reused build output from identical commit (job " + cached.ID.Hex() + ")"},
		CreatedAt:   now,
		UpdatedAt:   now,
		StartedAt:   &now,
		EndedAt:     &now,
	}
	jobCol := db.Client.Database("storehub").Collection("build_jobs")
	_, _ = jobCol.InsertOne(ctx, job)
}
