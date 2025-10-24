package db

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var Client *mongo.Client

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
