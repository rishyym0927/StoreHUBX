package handlers

import (
	"context"

	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// findCachedBuild looks for another version of the same component that was
// already built successfully from the same commit SHA. If found, its build
// output can be reused instead of re-running the full build pipeline.
func findCachedBuild(ctx context.Context, componentID primitive.ObjectID, commitSHA string) (*models.ComponentVersion, bool) {
	if commitSHA == "" {
		return nil, false
	}

	verCol := db.Client.Database("storehub").Collection("component_versions")
	var cached models.ComponentVersion
	err := verCol.FindOne(ctx, bson.M{
		"componentId": componentID,
		"commitSha":   commitSHA,
		"buildState":  models.VersionBuildReady,
		"previewUrl":  bson.M{"$ne": ""},
	}).Decode(&cached)
	if err != nil {
		return nil, false
	}
	return &cached, true
}
