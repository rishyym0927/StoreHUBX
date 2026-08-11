package db

import (
	"context"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var Client *mongo.Client

// defaultDBName is the database every part of the API server has always used.
const defaultDBName = "storehub"

// Name returns the database name to use.
//
// This exists to settle a split that predates it: the worker addressed Mongo
// as Database(os.Getenv("MONGO_DB")) while the API server, notifier and auth
// packages hardcoded "storehub". With MONGO_DB unset those are different
// databases ("" vs "storehub"), so the two processes could silently read and
// write different data. Every caller should go through this helper so the
// choice is made in exactly one place.
//
// MONGO_DB still wins when set, preserving deployments that rely on it.
func Name() string {
	if name := os.Getenv("MONGO_DB"); name != "" {
		return name
	}
	return defaultDBName
}

// DB returns the configured database handle.
func DB() *mongo.Database {
	return Client.Database(Name())
}

// Init initializes Mongo connection
func Init(uri string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatal("Mongo connect error:", err)
	}

	if err = client.Ping(ctx, nil); err != nil {
		log.Fatal("Mongo ping error:", err)
	}

	Client = client
	log.Println("✅ Connected to MongoDB")
}

// Disconnect closes the Mongo connection
func Disconnect() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := Client.Disconnect(ctx); err != nil {
		log.Println("Mongo disconnect error:", err)
	}
	log.Println("🛑 MongoDB connection closed")
}
