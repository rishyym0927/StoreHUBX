package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"

	"github.com/rishyym0927/storehubx/internal/cache"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/storage"
	"github.com/rishyym0927/storehubx/internal/worker"
	"github.com/rishyym0927/storehubx/internal/config"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	config.LoadConfig()
	db.Init(config.AppConfig.MongoURI)
	defer db.Disconnect()

	// The worker writes build_plans, so it needs its indexes even when it runs
	// without an API server alongside it (EnsureIndexes is idempotent).
	if err := db.EnsureIndexes(db.Client); err != nil {
		log.Println("ensure indexes:", err)
	}

	cache.Init()

	uploader, err := storage.NewS3Uploader()
	if err != nil {
		log.Fatal("s3 uploader:", err)
	}

	proc := worker.NewProcessor(uploader)
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	log.Println("storehub-worker: running")
	proc.Run(ctx)
	log.Println("storehub-worker: stopped")
}
