package buildplan

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"time"

	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const planCollection = "build_plans"

// lockfileNames are hashed alongside package.json to key a cached plan. Any
// change to declared dependencies produces a different hash, which naturally
// expires the plan rather than requiring explicit invalidation.
var lockfileNames = []string{
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
}

// LockfileHash fingerprints the dependency set of a component. buildDir is
// where package.json lives; installDir is where the lockfile lives (they
// differ for workspace members).
//
// Returns "" when there's nothing to hash, which callers treat as "not
// cacheable" rather than as a cache key — otherwise every package.json-less
// repo would share one entry.
func LockfileHash(repoRoot, buildDir, installDir string) string {
	h := sha256.New()
	wrote := false

	if raw, err := os.ReadFile(filepath.Join(repoRoot, buildDir, "package.json")); err == nil {
		h.Write(raw)
		wrote = true
	}
	for _, name := range lockfileNames {
		if raw, err := os.ReadFile(filepath.Join(repoRoot, installDir, name)); err == nil {
			h.Write([]byte(name))
			h.Write(raw)
			wrote = true
		}
	}

	if !wrote {
		return ""
	}
	return hex.EncodeToString(h.Sum(nil))
}

func planFilter(owner, repo, path, hash string) bson.M {
	return bson.M{
		"owner":        owner,
		"repo":         repo,
		"path":         path,
		"lockfileHash": hash,
	}
}

// FindCachedPlan returns a previously AI-derived plan for this exact
// (owner, repo, path, dependency set), if one was stored.
//
// The cached plan is NOT trusted on read: callers must still run Validate on
// the merged result, since a cache entry is just data in Mongo and could have
// been written by an older, buggier, or compromised path.
func FindCachedPlan(ctx context.Context, owner, repo, path, hash string) (*models.BuildPlan, bool) {
	if hash == "" {
		return nil, false
	}

	var cached models.CachedBuildPlan
	err := db.DB().Collection(planCollection).
		FindOne(ctx, planFilter(owner, repo, path, hash)).
		Decode(&cached)
	if err != nil {
		return nil, false
	}
	return &cached.Plan, true
}

// UpsertPlan stores an AI-derived plan. Best-effort: a cache write failure
// only costs an extra AI call next time, so the error is returned but callers
// may reasonably log and continue.
func UpsertPlan(ctx context.Context, owner, repo, path, hash string, plan *models.BuildPlan) error {
	if hash == "" || plan == nil {
		return nil
	}

	now := time.Now()
	_, err := db.DB().Collection(planCollection).UpdateOne(
		ctx,
		planFilter(owner, repo, path, hash),
		bson.M{
			"$set": bson.M{
				"plan":      plan,
				"updatedAt": now,
			},
			"$setOnInsert": bson.M{
				"owner":        owner,
				"repo":         repo,
				"path":         path,
				"lockfileHash": hash,
				"createdAt":    now,
			},
		},
		options.Update().SetUpsert(true),
	)
	return err
}

// InvalidatePlan removes a cached plan.
//
// Called when a build fails while running an AI-derived plan: without this, a
// wrong guess would be replayed on every retry and burn the job's whole
// attempt budget reproducing the same failure.
func InvalidatePlan(ctx context.Context, owner, repo, path, hash string) error {
	if hash == "" {
		return nil
	}
	_, err := db.DB().Collection(planCollection).
		DeleteOne(ctx, planFilter(owner, repo, path, hash))
	return err
}
