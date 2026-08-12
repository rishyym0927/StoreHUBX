// Command reap_orphans deletes built bundles in S3/MinIO whose component no
// longer exists in MongoDB.
//
// DeleteComponent cascades across Mongo but cannot touch object storage — the
// API process has no S3 client, only the worker does. So published bundles
// under components/{slug}/{version}/ outlive their component. This reclaims
// them out-of-band.
//
// This deletes data, so it is deliberately conservative:
//   - dry run unless --apply is passed
//   - aborts if the Mongo read fails or returns zero components, so a bad
//     connection can never be read as "nothing exists, delete everything"
//   - prints every prefix and a total before touching anything
//
// Usage:
//
//	go run cmd/reap_orphans/main.go            # dry run, prints what it would delete
//	go run cmd/reap_orphans/main.go --apply    # actually deletes
package main

import (
	"context"
	"flag"
	"log"
	"sort"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"

	"github.com/rishyym0927/storehubx/internal/config"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/storage"
)

// Matches the layout written by PublishComponentFromDist: components/{slug}/{version}/...
const componentPrefix = "components/"

func main() {
	apply := flag.Bool("apply", false, "actually delete the orphaned prefixes (default is a dry run)")
	flag.Parse()

	_ = godotenv.Load()
	config.LoadConfig()
	db.Init(config.AppConfig.MongoURI)
	defer db.Disconnect()

	uploader, err := storage.NewS3Uploader()
	if err != nil {
		log.Fatal("s3 uploader: ", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Build the set of live slugs first. If this read is wrong, everything
	// downstream is wrong in the most destructive possible direction.
	col := db.Client.Database("storehub").Collection("components")
	cursor, err := col.Find(ctx, bson.M{}, nil)
	if err != nil {
		log.Fatal("find components: ", err)
	}
	defer cursor.Close(ctx)

	var docs []struct {
		Slug string `bson:"slug"`
	}
	if err := cursor.All(ctx, &docs); err != nil {
		log.Fatal("decode components: ", err)
	}
	if len(docs) == 0 {
		log.Fatal("refusing to run: MongoDB returned zero components, which would mark every bundle an orphan")
	}

	live := make(map[string]struct{}, len(docs))
	for _, d := range docs {
		if d.Slug != "" {
			live[d.Slug] = struct{}{}
		}
	}
	log.Printf("%d live components in MongoDB", len(live))

	slugs, err := uploader.ListTopLevelPrefixes(ctx, componentPrefix)
	if err != nil {
		log.Fatal("list bucket prefixes: ", err)
	}
	log.Printf("%d component prefixes in the bucket", len(slugs))

	orphans := make([]string, 0)
	for _, slug := range slugs {
		if _, ok := live[slug]; !ok {
			orphans = append(orphans, slug)
		}
	}
	sort.Strings(orphans)

	if len(orphans) == 0 {
		log.Println("no orphaned bundles — nothing to do")
		return
	}

	for _, slug := range orphans {
		log.Printf("orphan: %s%s/", componentPrefix, slug)
	}
	log.Printf("%d orphaned component prefixes", len(orphans))

	if !*apply {
		log.Println("dry run — re-run with --apply to delete the prefixes listed above")
		return
	}

	deleted := 0
	for _, slug := range orphans {
		prefix := componentPrefix + slug + "/"
		n, err := uploader.DeletePrefix(ctx, prefix)
		if err != nil {
			log.Fatalf("delete %s: %v", prefix, err)
		}
		log.Printf("deleted %s (%d objects)", prefix, n)
		deleted += n
	}
	log.Printf("done — removed %d objects across %d prefixes", deleted, len(orphans))
}
