package db

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func EnsureIndexes(client *mongo.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db := client.Database("storehub")

	// components: slug unique
	_, _ = db.Collection("components").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "slug", Value: 1}},
		Options: nil,
	})

	// component_versions: componentId + version unique
	_, _ = db.Collection("component_versions").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "componentId", Value: 1}, {Key: "version", Value: 1}},
		Options: nil,
	})

	// component_versions: componentId + commitSha unique (prevent duplicate commits)
	_, _ = db.Collection("component_versions").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "componentId", Value: 1}, {Key: "commitSha", Value: 1}},
		Options: nil,
	})

	// build_jobs: filter by component/version/status
	_, _ = db.Collection("build_jobs").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "component", Value: 1}}},
		{Keys: bson.D{{Key: "version", Value: 1}}},
		{Keys: bson.D{{Key: "status", Value: 1}}},
	})

	return nil
}
