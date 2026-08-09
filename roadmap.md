# StoreHUBX Data-Model Restructuring Roadmap

## Context

The backend's MongoDB models grew organically and carried real structural debt: unbounded arrays on `Component` for likes/views, duplicated `Comment`/`Rating` collections, and `ComponentVersion`/`BuildJob` tracking the same "is this built" fact in two un-synced places. This roadmap tracked the fix across 5 phases. **Phases 1-5 backend are complete** (see `docs/models.md` for how the resulting models work). Phase 5's frontend UI is the only open item.

**Guiding decisions (confirmed with user):**
1. Keep external route paths and response JSON shapes close to what they were — internal consolidation, not an API redesign.
2. New feature models (Collection, Follow, Notification) are additive phases in this same roadmap; `Report`/`ApiToken` are backlog only, not scheduled.

---

## Phase 1 — Index correctness ✅ Done
Unique indexes on `components.slug` and `component_versions {componentId,version}`/`{componentId,commitSha}`.

## Phase 2 — Consolidate Comment + Rating + Likes into `Interaction` ✅ Done
Single `interactions` collection (partial-unique per user for like/rating, unlimited for comments). `Component.LikedBy` array replaced by a per-viewer `likedByMe` computed field.

## Phase 3 — Replace `UniqueVisitors` array with counter + Redis dedup ✅ Done
`Component.ViewCount` is a durable counter, deduped per-visitor via Redis `SetNX` (24h window), degrading to always-increment if Redis is down.

## Phase 4 — Resolve `ComponentVersion` / `BuildJob` duplication ✅ Done
`ComponentVersion` no longer tracks build status/preview URL — a version's status is "the latest `BuildJob` for its `versionId`". Worker no longer writes to `component_versions`.

## Phase 5 — New feature models

**Backend: ✅ Done.** `Collection`, `Follow`, `Notification` models/handlers/routes/indexes are live; `internal/notify` wires notifications into new-version, comment, and build-completion events.

**Frontend: not started.** Outstanding:
- Notification bell UI (list/mark-read against `GET /api/notifications`)
- Collections page (create/list/add/remove against `/api/collections`)
- `lib/api.ts` client wrappers for collections/follows/notifications (types already exist in `types/index.ts`)

**Backlog, not scheduled:** `Report`/moderation model, `ApiToken` for CLI-based publishing.

---

## Rollout notes
- No production data existed during this work, so no migration scripts were needed — schema changes were direct.
- Before starting the Phase 5 frontend work, run the backend + frontend together and exercise: create a collection, follow a component, publish a version, confirm a notification appears.
