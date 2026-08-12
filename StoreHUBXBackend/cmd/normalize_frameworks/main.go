// Command normalize_frameworks backfills the framework/tag normalization that
// CreateComponent now applies on write.
//
// The list filter lowercases its query and then matches stored values exactly,
// so a component stored as "React" is invisible to ?framework=react. This
// rewrites existing docs to the same lowercase/trimmed/de-duplicated form the
// handler produces, so old rows behave like new ones.
//
// It cannot fix genuine typos — a stored "reacy" simply becomes "reacy". Those
// are reported at the end so they can be corrected by hand.
//
// Usage:
//
//	go run cmd/normalize_frameworks/main.go            # dry run, prints changes
//	go run cmd/normalize_frameworks/main.go --apply    # writes them
package main

import (
	"context"
	"flag"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/rishyym0927/storehubx/internal/config"
	"github.com/rishyym0927/storehubx/internal/db"
)

// Mirrors handlers.normalizeTerms — kept in sync deliberately so the backfill
// and the write path can never disagree about what "normalized" means.
func normalizeTerms(terms []string) []string {
	seen := make(map[string]struct{}, len(terms))
	out := make([]string, 0, len(terms))
	for _, t := range terms {
		v := strings.ToLower(strings.TrimSpace(t))
		if v == "" {
			continue
		}
		if _, dup := seen[v]; dup {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

type componentDoc struct {
	ID         primitive.ObjectID `bson:"_id"`
	Slug       string             `bson:"slug"`
	Frameworks []string           `bson:"frameworks"`
	Tags       []string           `bson:"tags"`
}

func main() {
	apply := flag.Bool("apply", false, "write the changes (default is a dry run)")
	flag.Parse()

	_ = godotenv.Load()
	config.LoadConfig()
	db.Init(config.AppConfig.MongoURI)
	defer db.Disconnect()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")
	cursor, err := col.Find(ctx, bson.M{})
	if err != nil {
		log.Fatal("find components: ", err)
	}
	defer cursor.Close(ctx)

	var docs []componentDoc
	if err := cursor.All(ctx, &docs); err != nil {
		log.Fatal("decode components: ", err)
	}

	changed := 0
	suspicious := map[string]int{}

	for _, d := range docs {
		frameworks := normalizeTerms(d.Frameworks)
		tags := normalizeTerms(d.Tags)

		for _, f := range frameworks {
			suspicious[f]++
		}

		if equal(frameworks, d.Frameworks) && equal(tags, d.Tags) {
			continue
		}
		changed++
		log.Printf("%s: frameworks %v -> %v | tags %v -> %v", d.Slug, d.Frameworks, frameworks, d.Tags, tags)

		if *apply {
			if _, err := col.UpdateByID(ctx, d.ID, bson.M{
				"$set": bson.M{"frameworks": frameworks, "tags": tags},
			}); err != nil {
				log.Fatalf("update %s: %v", d.Slug, err)
			}
		}
	}

	log.Printf("scanned %d components, %d need changes", len(docs), changed)
	if !*apply {
		log.Println("dry run — re-run with --apply to write")
	}

	// Surface rare framework values, which are usually typos worth a look.
	rare := make([]string, 0)
	for name, count := range suspicious {
		if count == 1 {
			rare = append(rare, name)
		}
	}
	sort.Strings(rare)
	if len(rare) > 0 {
		log.Printf("frameworks used by exactly one component (check for typos): %v", rare)
	}
}
