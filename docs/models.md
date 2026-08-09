# Data Model Reference

MongoDB collections in `storehub` DB, defined in `StoreHUBXBackend/internal/models/`. All IDs are ObjectID unless noted. `ownerId`/`userId`/`followerId` fields hold a GitHub `providerId` string, not an ObjectID.

## Component (`components`)
Core entity. `slug` unique. Owns `RepoLink` (owner/repo/path/ref/commit + per-link `webhookSecret`).
- `likeCount`, `viewCount`, `averageRating`, `ratingCount` — durable counters, never recomputed from arrays.
- `likedByMe` — **not stored** (`bson:"-"`), populated per-request by `GetComponent` for the current viewer.
- `visibility` (`public`/`private`) + `collaborators` — gate access via `middleware.OptionalAuth`.

## Interaction (`interactions`)
Single collection backing **likes, ratings, and comments** — merged in Phase 2 to kill duplicated author-snapshot fields and N+1 lookups. Discriminated by `type`.
- `like` / `rating`: unique per `{componentId, userId, type}` (partial index, ratings/likes only — comments allow many).
- `rating`: `score` (1-5) + `content` holds the review text.
- `comment`: `content` holds the comment body.
- Author fields (`authorUsername/Name/Avatar`) snapshotted once at write time, trusted at read time.
- Likes: insert-first, duplicate-key error ⇒ treated as "already liked" ⇒ delete (avoids read-then-write races).

## ComponentVersion (`component_versions`)
A published version of a component. Unique on `{componentId, version}` and `{componentId, commitSha}`.
**Does not track build status or preview URL** — that's derived from `BuildJob` (see below). Just metadata: changelog, readme, codeUrl, commitSha, createdBy.

## BuildJob (`build_jobs`)
One build attempt. `versionId` is the FK to `ComponentVersion`. `status`: `queued → running → success|error`, retried with exponential backoff (`attempts`/`maxAttempts`/`nextAttemptAt`) until exhausted.
- **`Artifacts.BundleURL` is the single source of truth for a version's preview URL** — "is this version built?" = "what's the latest `BuildJob` for this `versionId`?" (queried via `GET .../versions/:version/builds`, sorted newest-first).
- Cache-hit reuse (`build_cache.go`): if another version already built the same `commitSha` successfully, a synthetic already-`success` `BuildJob` is inserted pointing at the same artifacts instead of rebuilding.

## Collection (`collections`)
User-curated group of components: `ownerId`, `name`, `componentIds []ObjectID`, `visibility`. Independent of everything else — pure many-to-many bookmark list.

## Follow (`follows`)
`followerId` follows a `targetType` (`user`|`component`) + `targetId` (providerId or component ObjectID hex). Unique per `{followerId, targetType, targetId}`. Feeds `Notification`.

## Notification (`notifications`)
In-app feed entry: `userId`, `type` (`new_version`|`comment`|`build_completed`), `componentId`, `message`, `read`. Created by `internal/notify` (a leaf package with no handler/worker dependency, so both can call it):
- `new_version` → fired on every successful version creation, to all `follows` targeting that component.
- `comment` → fired on `AddComment`, to the component owner (skipped if self-comment).
- `build_completed` → fired by the worker on final success/failure, to the build's triggering user (`BuildJob.ownerId`).

## User (`users`)
GitHub OAuth identity. `providerId` is the stable key referenced everywhere else as a plain string (not a Mongo relation).

## Relationships at a glance
```
User --ownerId--> Component --componentId--> ComponentVersion --versionId--> BuildJob
Component <--componentId-- Interaction (like/rating/comment)
Component <--targetId(component)-- Follow --followerId--> User
User --ownerId--> Collection --componentIds[]--> Component
User <--userId-- Notification
```
