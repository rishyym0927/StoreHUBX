# StoreHUBX Roadmap

Working list of fixes, improvements, and features, ordered for execution. Work top to bottom within a phase; phases are ordered by dependency (don't scale or extend a broken/unfinished product).

**How to use this with Claude Code:** start a fresh session (or `/clear`) per item below. Reference the item by number/name instead of re-explaining it — e.g. "work on Phase 1, item 2." Commit after each item is done and verified so progress persists independent of conversation history.

---

## Phase 1 — Critical fixes (do first, highest visibility)

- [ ] **1. Fix horizontal overflow on Browse and Component Detail pages** — filter panel, badges, and stats are clipped off the right edge of the viewport. Likely a missing `max-width`/`overflow-x` constraint on a container. Verify visually in-browser, not just via diff, since this bug is invisible in code review.
- [ ] **2. Fix Builds tab showing "No builds yet" for components with completed successful builds** — data mismatch between `ListBuildsForVersion` query and stored build records. Check version-string matching / field names.

## Phase 2 — Implementation improvements (existing features)

- [ ] **3. Stream build logs live in the UI** — backend already pushes rich step-by-step logs (`[STEP]`, `[DEBUG]`, `[SUCCESS]`) to `BuildJob.logs`; currently unused by the frontend. Poll or stream this while a build runs.
- [ ] **4. Fix or remove the "Install command" widget** (`npx storehubx install ...`) — implies a real CLI that doesn't exist; either build a minimal real CLI or relabel/remove it.
- [ ] **5. Improve search relevance** — replace `$regex` scan over name/description/tags with a Mongo text index (or dedicated search service) for real ranking and typo tolerance.

## Phase 3 — System design / scaling

- [ ] **6. Add retry + exponential backoff for failed build jobs** — builds directly on the per-job timeout added recently; currently a failed job just dies with no retry.
- [ ] **7. Add a caching layer (Redis) in front of `GET /components` and `GET /components/:slug`** — read-heavy, write-rare endpoints.
- [ ] **8. Move the build queue off Mongo polling** onto a real queue (Redis/RabbitMQ/SQS) — reduces DB load, adds proper at-least-once delivery semantics.
- [ ] **9. Put a CDN in front of MinIO/S3** for built component bundles — improves preview load time.
- [ ] **10. Add build pipeline observability/metrics** (success/failure rate, queue depth, build duration) — currently just a console heartbeat print.

## Phase 4 — New features

- [ ] **11. Component ratings/reviews** (beyond likes).
- [ ] **12. Webhook-based auto-deploy** on GitHub push — upgrade from the current manual "Auto-Deploy" trigger.
- [ ] **13. Build caching by commit SHA** — skip rebuilding when the same commit is redeployed.
- [ ] **14. Private/team components** — visibility control beyond fully public.
- [ ] **15. Usage analytics dashboard** for component owners — view/like data is already tracked, just not visualized.

---

## Already done (for reference, not re-work)

- Fixed `$addToSet` crash on fresh components (null `likedBy`/`uniqueVisitors` slices)
- Fixed worker hang with no timeout (added per-command and per-job timeouts)
- Wired up previously-unused `RateLimiter` middleware
- Removed dead code (`uploadFilesWithCorrectMimeTypes`, `stringsEqualFold`, obsolete one-off `cmd/fix_*` scripts)
