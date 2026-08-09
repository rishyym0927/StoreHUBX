package cache

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client is nil when Redis isn't configured/reachable — callers must treat
// every cache operation as best-effort so the API keeps working without it.
var Client *redis.Client

// Init connects to Redis using REDIS_ADDR (default localhost:6379). Unlike
// Mongo, Redis is a pure optimization here (cache + queue transport), so a
// connection failure logs a warning instead of calling log.Fatal.
func Init() {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	rdb := redis.NewClient(&redis.Options{Addr: addr})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("⚠️  Redis unavailable at %s (%v) — running without cache/queue", addr, err)
		return
	}

	Client = rdb
	log.Println("✅ Connected to Redis")
}

func Get(ctx context.Context, key string) (string, bool) {
	if Client == nil {
		return "", false
	}
	val, err := Client.Get(ctx, key).Result()
	if err != nil {
		return "", false
	}
	return val, true
}

func Set(ctx context.Context, key string, val string, ttl time.Duration) {
	if Client == nil {
		return
	}
	_ = Client.Set(ctx, key, val, ttl).Err()
}

func Del(ctx context.Context, keys ...string) {
	if Client == nil || len(keys) == 0 {
		return
	}
	_ = Client.Del(ctx, keys...).Err()
}

// SetNX sets key only if absent, returning true when this call was the one
// that set it (i.e. the first sighting within the TTL window). Degrades to
// always-true when Redis is unreachable, so callers gating a counter
// increment on it keep incrementing (uncounted-dedup) rather than dropping
// counts entirely.
func SetNX(ctx context.Context, key string, val string, ttl time.Duration) bool {
	if Client == nil {
		return true
	}
	ok, err := Client.SetNX(ctx, key, val, ttl).Result()
	if err != nil {
		return true
	}
	return ok
}

// Incr bumps an integer key (creating it at 1 if absent) and returns the new
// value — used as a cheap "epoch" counter to invalidate a whole family of
// cache keys at once without enumerating them.
func Incr(ctx context.Context, key string) int64 {
	if Client == nil {
		return 0
	}
	n, err := Client.Incr(ctx, key).Result()
	if err != nil {
		return 0
	}
	return n
}
