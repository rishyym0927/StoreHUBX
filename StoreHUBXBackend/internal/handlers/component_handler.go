package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/cache"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const viewDedupWindow = 24 * time.Hour

const (
	componentListCacheTTL = 30 * time.Second
	componentSlugCacheTTL = 15 * time.Second
)

func componentSlugCacheKey(slug string) string {
	return "cache:components:slug:" + slug
}

// invalidateComponentCaches busts the per-slug cache entry and bumps the
// list-cache epoch so every cached /components listing (across all
// page/filter combinations) is treated as stale, without having to
// enumerate and delete each one individually.
func invalidateComponentCaches(ctx context.Context, slug string) {
	cache.Del(ctx, componentSlugCacheKey(slug))
	cache.Incr(ctx, "cache:components:list:epoch")
}

// findComponentBySlug fetches a component by its slug.
func findComponentBySlug(ctx context.Context, slug string) (models.Component, error) {
	var comp models.Component
	err := db.Client.Database("storehub").Collection("components").
		FindOne(ctx, bson.M{"slug": slug}).Decode(&comp)
	return comp, err
}

// POST /api/components  (protected)
func CreateComponent(c *fiber.Ctx) error {
	var body models.Component
	if err := c.BodyParser(&body); err != nil {
		return utils.Error(c, 400, "invalid JSON body")
	}
	if body.Name == "" || len(body.Frameworks) == 0 {
		return utils.Error(c, 400, "component name and frameworks are required")
	}

	uid, _ := c.Locals("user_id").(string)
	body.OwnerID = uid
	now := time.Now()
	body.CreatedAt = now
	body.UpdatedAt = now

	// The list filter lowercases the incoming query and then matches stored
	// values exactly, so anything stored with different casing is invisible to
	// it. Normalize on write so both sides agree.
	body.Frameworks = normalizeTerms(body.Frameworks)
	body.Tags = normalizeTerms(body.Tags)
	if len(body.Frameworks) == 0 {
		return utils.Error(c, 400, "component name and frameworks are required")
	}
	if body.Visibility != "private" {
		body.Visibility = "public"
	}
	if body.Collaborators == nil {
		body.Collaborators = []string{}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")

	baseSlug := strings.ToLower(strings.ReplaceAll(body.Name, " ", "-"))
	body.Slug = baseSlug
	for suffix := 2; suffix <= 50; suffix++ {
		count, err := col.CountDocuments(ctx, bson.M{"slug": body.Slug})
		if err != nil {
			return utils.Error(c, 500, "failed to validate slug")
		}
		if count == 0 {
			break
		}
		body.Slug = fmt.Sprintf("%s-%d", baseSlug, suffix)
	}

	res, err := col.InsertOne(ctx, body)
	if err != nil {
		return utils.Error(c, 500, "failed to insert component")
	}
	// Without this the response carries a zero ObjectID, so a client can't use
	// the created component's id (to follow it, add it to a collection, …)
	// without re-fetching by slug. Matches CreateCollection.
	if oid, ok := res.InsertedID.(primitive.ObjectID); ok {
		body.ID = oid
	}
	cache.Incr(ctx, "cache:components:list:epoch")

	return utils.Success(c, fiber.Map{
		"status":    "created",
		"component": body,
	})
}

// GET /components  (public)  with q, framework, tags, sort, page, limit
func GetAllComponents(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")

	// Pagination
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 10
	}
	skip := (page - 1) * limit

	// Filters
	q := strings.TrimSpace(c.Query("q", ""))
	framework := strings.TrimSpace(strings.ToLower(c.Query("framework", "")))
	tagsParam := strings.TrimSpace(c.Query("tags", "")) // "ui,button,react"

	// Sort: an explicit rating/likes/views choice takes priority over
	// textScore ranking even when q is set — the caller chose it deliberately.
	// Anything else (empty, "newest", or unrecognized) keeps current behavior.
	sortParam := strings.ToLower(strings.TrimSpace(c.Query("sort", "")))
	sortOverridesTextScore := sortParam == "rating" || sortParam == "likes" || sortParam == "views"

	epoch, _ := cache.Get(ctx, "cache:components:list:epoch")
	listCacheKey := fmt.Sprintf("cache:components:list:v%s:p=%d:l=%d:q=%s:f=%s:t=%s:s=%s", epoch, page, limit, q, framework, tagsParam, sortParam)
	if cached, hit := cache.Get(ctx, listCacheKey); hit {
		c.Set("Content-Type", "application/json")
		return c.SendString(fmt.Sprintf(`{"success":true,"data":%s}`, cached))
	}

	// Public listing never surfaces private components, regardless of caller.
	filter := bson.M{"visibility": bson.M{"$ne": "private"}}
	if q != "" {
		filter["$text"] = bson.M{"$search": q}
	}
	if framework != "" {
		filter["frameworks"] = framework
	}
	if tagsParam != "" {
		raw := strings.Split(tagsParam, ",")
		tags := make([]string, 0, len(raw))
		for _, t := range raw {
			if tt := strings.TrimSpace(strings.ToLower(t)); tt != "" {
				tags = append(tags, tt)
			}
		}
		if len(tags) > 0 {
			filter["tags"] = bson.M{"$all": tags}
		}
	}

	// IMPORTANT: pre-init so it marshals as [] not null
	components := make([]models.Component, 0, limit)

	if q != "" {
		// Rank by text relevance when searching (requires the $meta score
		// field to be added via aggregation so all other fields survive) —
		// unless the caller explicitly asked for a different sort, which
		// takes priority over textScore ranking.
		pipeline := mongo.Pipeline{
			{{Key: "$match", Value: filter}},
		}
		var sortStage bson.D
		if sortOverridesTextScore {
			sortStage = componentSortOrder(sortParam)
		} else {
			pipeline = append(pipeline, bson.D{{Key: "$addFields", Value: bson.M{"score": bson.M{"$meta": "textScore"}}}})
			sortStage = bson.D{{Key: "score", Value: bson.M{"$meta": "textScore"}}}
		}
		pipeline = append(pipeline,
			bson.D{{Key: "$sort", Value: sortStage}},
			bson.D{{Key: "$skip", Value: int64(skip)}},
			bson.D{{Key: "$limit", Value: int64(limit)}},
		)
		cursor, err := col.Aggregate(ctx, pipeline)
		if err != nil {
			return utils.Error(c, 500, "database error")
		}
		defer cursor.Close(ctx)
		if err := cursor.All(ctx, &components); err != nil {
			return utils.Error(c, 500, "failed to decode components")
		}
	} else {
		opts := options.Find().
			SetSkip(int64(skip)).
			SetLimit(int64(limit)).
			SetSort(componentSortOrder(sortParam))

		cursor, err := col.Find(ctx, filter, opts)
		if err != nil {
			return utils.Error(c, 500, "database error")
		}
		defer cursor.Close(ctx)
		if err := cursor.All(ctx, &components); err != nil {
			return utils.Error(c, 500, "failed to decode components")
		}
	}

	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		total = int64(len(components)) // fallback
	}

	data := fiber.Map{
		"page":       page,
		"limit":      limit,
		"total":      total,
		"components": components, // [] when empty
	}

	if dataBytes, err := json.Marshal(data); err == nil {
		cache.Set(ctx, listCacheKey, string(dataBytes), componentListCacheTTL)
	}

	return utils.Success(c, data)
}

// GET /components/:slug  (public)
func GetComponent(c *fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("components")

	uid, _ := c.Locals("user_id").(string)

	visitorID := c.IP()
	if uid != "" {
		visitorID = uid
	}
	if visitorID == "" {
		visitorID = "anonymous"
	}

	// Count this view at most once per visitor per dedup window via a Redis
	// SetNX; if Redis is unreachable this degrades to counting every
	// request, matching this package's existing no-Redis degrade pattern.
	if cache.SetNX(ctx, "viewed:"+slug+":"+visitorID, "1", viewDedupWindow) {
		_, _ = col.UpdateOne(ctx, bson.M{"slug": slug}, bson.M{"$inc": bson.M{"viewCount": 1}})
	}

	// likedByMe/followedByMe are per-viewer, so the cached blob (shared
	// across all anonymous viewers) can only be served when there's no
	// authenticated viewer to compute them for. Private components need a
	// live authorization check regardless, so they never use the cache either.
	cacheKey := componentSlugCacheKey(slug)
	if uid == "" {
		if cached, hit := cache.Get(ctx, cacheKey); hit {
			var cachedComp models.Component
			if err := json.Unmarshal([]byte(cached), &cachedComp); err == nil && cachedComp.Visibility != "private" {
				c.Set("Content-Type", "application/json")
				return c.SendString(fmt.Sprintf(`{"success":true,"data":{"component":%s}}`, cached))
			}
		}
	}

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	if comp.Visibility == "private" {
		if uid == "" || (uid != comp.OwnerID && !contains(comp.Collaborators, uid)) {
			return utils.Error(c, 404, "component not found")
		}
	}

	if uid != "" {
		interactionCol := db.Client.Database("storehub").Collection("interactions")
		count, _ := interactionCol.CountDocuments(ctx, bson.M{"componentId": comp.ID, "userId": uid, "type": models.InteractionLike})
		comp.LikedByMe = count > 0

		// Follows key off the component's ObjectID hex, not its slug — see
		// notify.NewVersion, which fans out on the same targetId.
		followCol := db.Client.Database("storehub").Collection("follows")
		followCount, _ := followCol.CountDocuments(ctx, bson.M{
			"followerId": uid,
			"targetType": models.FollowTargetComponent,
			"targetId":   comp.ID.Hex(),
		})
		comp.FollowedByMe = followCount > 0
	}

	if comp.Visibility != "private" && uid == "" {
		if compBytes, err := json.Marshal(comp); err == nil {
			cache.Set(ctx, cacheKey, string(compBytes), componentSlugCacheTTL)
		}
	}

	return utils.Success(c, fiber.Map{
		"component": comp,
	})
}

// componentSortOrder maps the `sort` query param on GET /components to a
// Mongo sort spec. Empty, "newest", or any unrecognized value falls back to
// createdAt desc (current/default behavior) rather than erroring.
func componentSortOrder(sortParam string) bson.D {
	switch sortParam {
	case "rating":
		return bson.D{{Key: "averageRating", Value: -1}, {Key: "ratingCount", Value: -1}, {Key: "createdAt", Value: -1}}
	case "likes":
		return bson.D{{Key: "likeCount", Value: -1}, {Key: "createdAt", Value: -1}}
	case "views":
		return bson.D{{Key: "viewCount", Value: -1}, {Key: "createdAt", Value: -1}}
	default:
		return bson.D{{Key: "createdAt", Value: -1}}
	}
}

// normalizeTerms trims, lowercases and de-duplicates a framework/tag list
// while preserving the author's ordering. Shared by CreateComponent and the
// cmd/normalize_frameworks backfill so both apply identical rules.
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

func contains(list []string, target string) bool {
	for _, v := range list {
		if v == target {
			return true
		}
	}
	return false
}

// DELETE /api/components/:slug (owner-only)
// Cascades to everything keyed off the component so nothing orphaned is left
// behind: versions, build jobs, likes/ratings/comments (interactions),
// notifications, and its membership in any collections. Deletes dependents
// before the component doc itself so a mid-failure retry is safe (re-running
// DeleteMany against already-empty collections is a no-op) rather than
// leaving the component gone but its dependents still pointing at it.
//
// Note: this does not delete the built bundle assets from S3/MinIO. The API
// process has no S3 client (only the worker constructs one), so that cleanup
// is handled out-of-band by cmd/reap_orphans, which deletes bucket prefixes
// with no surviving component.
func DeleteComponent(c *fiber.Ctx) error {
	slug := c.Params("slug")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}
	if comp.OwnerID != uid {
		return utils.Error(c, 403, "only the owner can delete this component")
	}

	database := db.Client.Database("storehub")
	if _, err := database.Collection("component_versions").DeleteMany(ctx, bson.M{"componentId": comp.ID}); err != nil {
		return utils.Error(c, 500, "failed to delete component versions")
	}
	if _, err := database.Collection("build_jobs").DeleteMany(ctx, bson.M{"componentId": comp.ID}); err != nil {
		return utils.Error(c, 500, "failed to delete build jobs")
	}
	if _, err := database.Collection("interactions").DeleteMany(ctx, bson.M{"componentId": comp.ID}); err != nil {
		return utils.Error(c, 500, "failed to delete likes/ratings/comments")
	}
	if _, err := database.Collection("notifications").DeleteMany(ctx, bson.M{"componentId": comp.ID}); err != nil {
		return utils.Error(c, 500, "failed to delete notifications")
	}
	// Follows key off the component's ObjectID *hex*, not the ObjectID — same
	// as notify.NewVersion and the followedByMe lookup in GetComponent.
	if _, err := database.Collection("follows").DeleteMany(ctx, bson.M{
		"targetType": models.FollowTargetComponent,
		"targetId":   comp.ID.Hex(),
	}); err != nil {
		return utils.Error(c, 500, "failed to delete follows")
	}
	if _, err := database.Collection("collections").UpdateMany(
		ctx,
		bson.M{"componentIds": comp.ID},
		bson.M{"$pull": bson.M{"componentIds": comp.ID}},
	); err != nil {
		return utils.Error(c, 500, "failed to update collections")
	}

	res, err := database.Collection("components").DeleteOne(ctx, bson.M{"_id": comp.ID})
	if err != nil {
		return utils.Error(c, 500, "failed to delete component")
	}
	if res.DeletedCount == 0 {
		return utils.Error(c, 404, "component not found")
	}

	invalidateComponentCaches(ctx, slug)

	return utils.Success(c, fiber.Map{
		"message": "component deleted",
	})
}

// POST /components/:slug/like (Protected)
func ToggleLikeComponent(c *fiber.Ctx) error {
	slug := c.Params("slug")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	col := db.Client.Database("storehub").Collection("components")
	interactionCol := db.Client.Database("storehub").Collection("interactions")

	// Insert a like first — the partial unique index on {componentId,
	// userId, type} rejects a second insert with a duplicate-key error,
	// which we treat as "already liked" and convert into an unlike.
	liked := true
	_, err = interactionCol.InsertOne(ctx, models.Interaction{
		ComponentID: comp.ID,
		UserID:      uid,
		Type:        models.InteractionLike,
		CreatedAt:   time.Now(),
	})
	if mongo.IsDuplicateKeyError(err) {
		liked = false
		if _, err := interactionCol.DeleteOne(ctx, bson.M{"componentId": comp.ID, "userId": uid, "type": models.InteractionLike}); err != nil {
			return utils.Error(c, 500, "failed to update like status")
		}
	} else if err != nil {
		return utils.Error(c, 500, "failed to update like status")
	}

	inc := 1
	if !liked {
		inc = -1
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updatedComp models.Component
	if err := col.FindOneAndUpdate(ctx, bson.M{"slug": slug}, bson.M{"$inc": bson.M{"likeCount": inc}}, opts).Decode(&updatedComp); err != nil {
		return utils.Error(c, 500, "failed to update like status")
	}
	updatedComp.LikedByMe = liked
	invalidateComponentCaches(ctx, slug)

	return utils.Success(c, fiber.Map{
		"message":   "like toggled",
		"component": updatedComp,
	})
}
