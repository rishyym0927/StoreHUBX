package db

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func EnsureIndexes(client *mongo.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db := client.Database(Name())

	// components: slug unique
	_, _ = db.Collection("components").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "slug", Value: 1}},
		Options: options.Index().SetUnique(true),
	})

	// components: weighted text index for search relevance (name > tags > description)
	_, _ = db.Collection("components").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "name", Value: "text"},
			{Key: "tags", Value: "text"},
			{Key: "description", Value: "text"},
		},
		Options: options.Index().SetWeights(bson.D{
			{Key: "name", Value: 10},
			{Key: "tags", Value: 5},
			{Key: "description", Value: 1},
		}).SetName("components_text_search"),
	})

	// component_versions: componentId + version unique
	_, _ = db.Collection("component_versions").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "componentId", Value: 1}, {Key: "version", Value: 1}},
		Options: options.Index().SetUnique(true),
	})

	// component_versions: componentId + commitSha unique (prevent duplicate commits)
	_, _ = db.Collection("component_versions").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "componentId", Value: 1}, {Key: "commitSha", Value: 1}},
		Options: options.Index().SetUnique(true),
	})

	// interactions: one like/rating per user per component; comments allow
	// many per user, so the unique constraint only applies to like/rating.
	_, _ = db.Collection("interactions").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "componentId", Value: 1}, {Key: "userId", Value: 1}, {Key: "type", Value: 1}},
		Options: options.Index().
			SetUnique(true).
			SetPartialFilterExpression(bson.M{"type": bson.M{"$in": bson.A{"like", "rating"}}}),
	})

	// interactions: paginated listing of comments/ratings for a component
	_, _ = db.Collection("interactions").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "componentId", Value: 1}, {Key: "type", Value: 1}, {Key: "createdAt", Value: -1}},
		Options: nil,
	})

	// build_jobs: filter by component/version/status
	_, _ = db.Collection("build_jobs").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "component", Value: 1}}},
		{Keys: bson.D{{Key: "version", Value: 1}}},
		{Keys: bson.D{{Key: "status", Value: 1}}},
	})

	// build_plans: one cached plan per repo subpath per dependency set. Path is
	// part of the key because a single repo can host several components at
	// different subpaths, and lockfileHash is part of it so a dependency change
	// re-derives the plan instead of reusing a stale one.
	_, _ = db.Collection("build_plans").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "owner", Value: 1},
			{Key: "repo", Value: 1},
			{Key: "path", Value: 1},
			{Key: "lockfileHash", Value: 1},
		},
		Options: options.Index().SetUnique(true),
	})

	// collections: list a user's collections
	_, _ = db.Collection("collections").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "ownerId", Value: 1}},
		Options: nil,
	})

	// follows: a user can only follow the same target once
	_, _ = db.Collection("follows").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "followerId", Value: 1}, {Key: "targetType", Value: 1}, {Key: "targetId", Value: 1}},
		Options: options.Index().SetUnique(true),
	})

	// notifications: a user's feed, unread-first
	_, _ = db.Collection("notifications").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "userId", Value: 1}, {Key: "read", Value: 1}, {Key: "createdAt", Value: -1}},
		Options: nil,
	})

	return nil
}
