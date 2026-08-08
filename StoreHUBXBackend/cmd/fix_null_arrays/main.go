package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// One-off backfill: components created before likedBy/uniqueVisitors were
// initialized to [] have those fields stored as BSON null, which breaks
// $addToSet in GetComponent/ToggleLikeComponent. This sets them to [].
func main() {
	_ = godotenv.Load()

	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		log.Fatal("MONGO_URI not set")
	}
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		dbName = "storehub"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatalf("connect failed: %v", err)
	}
	defer client.Disconnect(ctx)

	col := client.Database(dbName).Collection("components")

	res, err := col.UpdateMany(ctx,
		bson.M{"$or": []bson.M{
			{"likedBy": nil},
			{"uniqueVisitors": nil},
		}},
		bson.M{"$set": bson.M{"likedBy": []string{}, "uniqueVisitors": []string{}}},
	)
	if err != nil {
		log.Fatalf("update failed: %v", err)
	}

	log.Printf("fixed %d component(s) with null likedBy/uniqueVisitors", res.ModifiedCount)
}
