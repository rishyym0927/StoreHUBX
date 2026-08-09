# StoreHUBX Data-Model Restructuring Roadmap

## Context

The backend's 6 MongoDB models grew organically and now carry real structural debt:

- `Component.LikedBy`/`UniqueVisitors` are unbounded arrays embedded on the component doc — every `GetComponent` call does `$addToSet` on `uniqueVisitors` and recomputes `ViewCount` from the array's length at read time (`component_handler.go:226-257`); `ToggleLikeComponent` fetches the whole array over the wire just to check membership (`component_handler.go:296-329`).
- `Comment` and `Rating` are separate collections with duplicated author-snapshot fields and inconsistent index coverage (`ratings` has a correct unique index; `comments` has **no index at all**).
- `ComponentVersion.PreviewURL`/`BuildState` and `BuildJob.Status`/`Artifacts` track the same "is this build done" fact in two documents, updated by two separate un-transactional writes, matched by a fragile `{componentId, version}` string filter instead of an ObjectID FK (`worker.go:293-345`). There's no code path that ever sets `ComponentVersion.BuildState = running`.
- There's no way to add a new engagement type (bookmark, flag, share) without adding a new collection, model, handler set, and index from scratch — the opposite of open/closed.

There is **no production data yet**, so this is the only window to fix the shape of these collections without a live migration. Confirmed via codebase audit (handlers, worker, indexes, frontend `types/index.ts`/`lib/api.ts`) that the external API contract can stay stable while the internal model changes — minimizing blast radius on the Next.js frontend, whose `useBuildStatus`/`useBuilds` hooks already treat `BuildJob` as the live-status source of truth, and whose `getVersionBuildStateLabel` helper (built on `ComponentVersion.BuildState`) is dead code, unused anywhere in the UI.

**Guiding decisions (confirmed with user):**
1. Keep external route paths and response JSON shapes close to what they are today — this is an internal consolidation, not an API redesign. Frontend changes are limited to the specific fields being removed (`likedBy` array → `likedByMe` boolean; version `previewUrl`/`buildState` removal).
2. New feature models (Collection, Follow, Notification) are included as later phases in this same roadmap; Report/ApiToken are noted as backlog only, not scheduled.

Each phase is independently shippable and low-risk relative to the last — do not start a phase until the previous one is merged and verified.

---

## Phase 1 — Index correctness (foundation, no behavior change)

Fix `internal/db/indexes.go` before building anything new on top of it:
- `components.slug` → add `SetUnique(true)` (currently created with `Options: nil` despite `CreateComponent` relying on slug uniqueness at the app level only).
- `component_versions {componentId, version}` and `{componentId, commitSha}` → add `SetUnique(true)` to both (currently unenforced at the DB level; `AddVersion`/`createVersionAndBuild` only pre-check via `FindOne`, which is race-prone under concurrent requests).
- Add an index on `comments.componentId` (currently has none) — moot once Phase 2 lands, but protects the collection if Phase 2 slips.

**Files:** `internal/db/indexes.go`.
**Verification:** run the backend against a fresh MongoDB instance, confirm `EnsureIndexes` succeeds, `db.components.getIndexes()` shows `unique: true` on slug, attempt to insert a duplicate slug/version via the API and confirm it's rejected.

---

## Phase 2 — Consolidate Comment + Rating + Likes into `Interaction`

**New model** (`internal/models/interaction.go`):
```go
type InteractionType string
const (
    InteractionLike    InteractionType = "like"
    InteractionRating  InteractionType = "rating"
    InteractionComment InteractionType = "comment"
)

type Interaction struct {
    ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    ComponentID    primitive.ObjectID `bson:"componentId" json:"componentId"`
    UserID         string             `bson:"userId" json:"userId"`
    Type           InteractionType    `bson:"type" json:"type"`
    AuthorUsername string             `bson:"authorUsername,omitempty" json:"authorUsername,omitempty"`
    AuthorName     string             `bson:"authorName,omitempty" json:"authorName,omitempty"`
    AuthorAvatar   string             `bson:"authorAvatar,omitempty" json:"authorAvatar,omitempty"`
    Score          int                `bson:"score,omitempty" json:"score,omitempty"`     // rating only
    Content        string             `bson:"content,omitempty" json:"content,omitempty"` // comment only
    CreatedAt      time.Time          `bson:"createdAt" json:"createdAt"`
    UpdatedAt      time.Time          `bson:"updatedAt,omitempty" json:"updatedAt,omitempty"`
}
```
Keep the author-snapshot fields (written once, at creation) — do **not** re-fetch from `users` per item at read time. This also fixes an existing bug: `GetComments` (`comment_handler.go:33-52`) currently does an N+1 live lookup against `users` per comment despite the fields already being stored; `rating_handler.go` already does it the right way (trusts the snapshot). Standardize on the rating handler's pattern.

**Indexes** (add to `internal/db/indexes.go`):
- `interactions {componentId, userId, type}` — **partial unique**, `partialFilterExpression: {type: {$in: ["like", "rating"]}}` (comments allow many per user; like/rating are one-per-user, same as today's `ratings` unique index).
- `interactions {componentId, type, createdAt}` — supports paginated comment/rating listing.

**Handler changes:**
- `internal/handlers/comment_handler.go`, `rating_handler.go` → collapse into `internal/handlers/interaction_handler.go`, or keep as two thin files that both operate on the `interactions` collection filtered by `type` — match existing file granularity, don't force a merge that isn't warranted.
- `ToggleLikeComponent` (`component_handler.go:282-335`) → replace the `FindOne`-then-scan-`LikedBy` pattern with: try `InsertOne` on `interactions{type:"like"}`; on duplicate-key error (partial unique index catches it) treat as already-liked and instead `DeleteOne`. This removes the race window between the read and the write that exists today, and removes `Component.LikedBy` from the wire entirely.
- `recalculateRatingStats` (`rating_handler.go:18-51`) → same aggregation logic, source collection becomes `interactions` filtered by `type:"rating"`.
- `CreateComponent` (`component_handler.go:56-57`) → stop initializing `LikedBy`/arrays.
- **New:** `GetComponent` (already behind `middleware.OptionalAuth`) computes `likedByMe bool` by checking `interactions.findOne({componentId, userId: viewerID, type:"like"})` when a viewer token is present — this is the one new bit of read logic needed to replace what the array used to give the frontend for free.

**Model changes:**
- `internal/models/component.go` → remove `LikedBy []string`. Keep `LikeCount int` (already behaves as a real counter kept in sync via `$inc`, confirmed in the audit — no change needed there beyond removing the array it was paired with). Add `LikedByMe bool` as a response-only field (`bson:"-"`), populated by the handler, not stored.
- Delete `internal/models/comment.go`, `internal/models/rating.go`.

**Frontend changes** (external contract stays stable per the confirmed decision):
- `types/index.ts`: `Component.likedBy?: string[]` → `Component.likedByMe?: boolean`; `Comment`/`Rating` types stay as-is (still the shape returned by `GET .../comments` / `GET .../ratings` — those routes keep returning the same JSON, just sourced from `interactions` internally).
- `components/common/like-button.tsx` (`initialLikedBy: string[]`, line ~12/27-30/40/43/89) → switch prop to `initialLikedByMe: boolean`, drop the `.includes(user.providerId)` check.
- `app/components/[slug]/page.tsx:113-118` → pass `comp.likedByMe` instead of `comp.likedBy`.

**Files:** `internal/models/interaction.go` (new), `internal/handlers/comment_handler.go`, `internal/handlers/rating_handler.go`, `internal/handlers/component_handler.go`, `internal/db/indexes.go`, `internal/models/component.go`; frontend `types/index.ts`, `components/common/like-button.tsx`, `app/components/[slug]/page.tsx`.

**Verification:** like/unlike toggles correctly and survives a rapid double-click (no double-count, confirms the unique-index-based race fix); comment CRUD and rating upsert/delete round-trip through the API unchanged from the frontend's perspective; `db.interactions.getIndexes()` shows the partial unique index; manually hit the duplicate-key path (insert same like twice) and confirm it's handled as a no-op, not a 500.

---

## Phase 3 — Replace `UniqueVisitors` array with counter + Redis dedup

This is the more urgent half of the array problem — view volume is orders of magnitude higher than likes, so an unbounded per-visitor array here is the bigger risk (16MB document cap, full-array fetch cost on every `GetComponent`).

- `internal/models/component.go` → remove `UniqueVisitors []string`; `ViewCount int` becomes a durable, directly-incremented counter (today it's paradoxically *not* persisted — it's recomputed from array length at read time, per the audit).
- `GetComponent` (`component_handler.go:226-257`) → replace `$addToSet` on `uniqueVisitors` with: `cache.Client.SetNX(ctx, "viewed:<slug>:<visitorKey>", 1, 24*time.Hour)` (visitor key = user ID if authenticated, else an IP/UA hash) using the existing `internal/cache` Redis wrapper; on a fresh `SetNX` (first view in the window), `$inc` `component.viewCount` by 1 in Mongo. If Redis is unreachable, degrade to always incrementing (matches the existing "degrade gracefully to no-cache" pattern documented for this package) rather than blocking the read.
- `analytics_handler.go:56,62,69` → read `comp.ViewCount` directly instead of `len(comp.UniqueVisitors)`.

**Files:** `internal/models/component.go`, `internal/handlers/component_handler.go`, `internal/handlers/analytics_handler.go`.
**Verification:** repeated requests from the same viewer within 24h increment `viewCount` only once; requests from different viewers each increment it; confirm behavior with Redis stopped (docker-compose down on the redis service) — reads should still succeed and still count views, just without dedup.

---

## Phase 4 — Resolve `ComponentVersion` / `BuildJob` duplication

- `internal/models/build_job.go` → add `VersionID primitive.ObjectID` field, populated at job creation (`build.go`, `version_handler.go`) instead of relying on the `{componentId, version}` string-match the worker currently uses to locate the version doc.
- `internal/models/version.go` → remove `PreviewURL`/`BuildState` and the `BuildState` enum entirely. A version's build status becomes: "the latest `BuildJob` for this `VersionID`" — queried via the existing `internal/handlers/build.go` / `GET /components/:slug/versions/:version/builds` endpoint, which the frontend's `useBuildStatus`/`useBuilds` hooks already treat as the source of truth for live status (confirmed unused-in-UI: `lib/api-utils.ts`'s `getVersionBuildStateLabel`/`getVersionBuildStateColor` helpers, safe to delete alongside the field).
- `worker/worker.go` (`process()` success/fail paths, `internal/handlers/build_cache.go`'s cached-build-reuse path) → stop writing to `component_versions.previewUrl`/`buildState`; the build's `Artifacts.BundleURL` on `BuildJob` becomes the single source of truth for the preview URL.
- Frontend: `components/common/component-detail-tabs.tsx` (`latestVersion?.previewUrl`) and `components/common/version-list.tsx` (`previewUrl?: string | null` prop) → switch to deriving the preview URL from the version's latest `BuildJob` (via `buildApi.list`/`useBuilds`, already wired up) instead of a field on `ComponentVersion`; `version-list.tsx` already has a fallback path through `previewApi.getPreviewUrl` for the no-`previewUrl` case — this becomes the only path, not a fallback.
- `app/(private)/components/[slug]/new-version/page.tsx` → remove the `previewUrl` form field and drop it from `VersionCreateRequest` (`types/index.ts:244-251`) — it was only ever a client-supplied seed for a field that's about to stop existing.

**Files:** `internal/models/build_job.go`, `internal/models/version.go`, `internal/worker/worker.go`, `internal/handlers/build.go`, `internal/handlers/build_cache.go`, `internal/handlers/version_handler.go`; frontend `components/common/component-detail-tabs.tsx`, `components/common/version-list.tsx`, `app/(private)/components/[slug]/new-version/page.tsx`, `types/index.ts`, `lib/api-utils.ts` (delete dead helpers).

**Verification:** trigger a build end-to-end (enqueue → worker picks up via `XREADGROUP` → success), confirm the preview tab and version list resolve the bundle URL purely from `BuildJob` data with no `ComponentVersion.previewUrl` involved; trigger a build failure and confirm the UI reflects `error` status correctly; confirm the build-cache reuse path (`build_cache.go`) still works when a new version reuses an existing successful `commitSha`.

---

## Phase 5 — New feature models

Each is additive (new collection, new routes) — no existing model changes required, so these can ship independently and in any order once Phases 1-4 are stable.

- **`Collection`** — user-curated groups of components (`internal/models/collection.go`): `{id, ownerId, name, description, componentIds []ObjectID, visibility, createdAt, updatedAt}`. New handler + routes (`POST /api/collections`, `GET /users/:id/collections`, `POST/DELETE /api/collections/:id/components/:componentId`). Index: `{ownerId}`.
- **`Follow`** — follow a user or a component (`internal/models/follow.go`): `{id, followerId, targetType: "user"|"component", targetId, createdAt}`. Partial-unique index on `{followerId, targetType, targetId}`. Feeds Notification below.
- **`Notification`** — in-app event feed (`internal/models/notification.go`): `{id, userId, type, componentId, message, read bool, createdAt}`. Populated by: new version published on a followed component (hook into `AddVersion`), reply/comment on your component (hook into the Phase-2 comment path), build completion on your own component (hook into `worker.go`'s success/fail paths). Index: `{userId, read, createdAt}`.

**Files:** new `internal/models/collection.go`, `internal/models/follow.go`, `internal/models/notification.go`; new handler files following the existing per-domain pattern (`internal/handlers/collection_handler.go`, etc.); route additions in `internal/routes/routes.go`; corresponding frontend types + a minimal notification bell / collections UI (scope TBD when this phase starts — not detailed here since it depends on which of the three ships first).

**Backlog, not scheduled:** `Report`/moderation model (needs a status workflow + admin `Role` on `User`, only worth building when moderation is an actual need) and `ApiToken` for CLI-based publishing (only worth it if a CLI publish flow is planned).

---

## Rollout notes

- Do these phases in order — each later phase assumes the previous one's collections/indexes exist.
- Since there's no production data, no backfill/migration scripts are needed for Phases 1-4 — this is schema-first, not data-migration work. If real data exists by the time a phase starts, re-scope that phase to add a migration step.
- After each phase, run the backend (`go run cmd/main.go` + `go run cmd/worker/main.go`) and the frontend (`npm run dev`) together and exercise the affected flow manually (like/unlike, comment, rate, publish a version, watch a build complete) before moving to the next phase.
