# StoreHUBX Roadmap

Working list of fixes, improvements, and features, ordered for execution. Work top to bottom within a phase; phases are ordered by dependency (don't scale or extend a broken/unfinished product).

**How to use this with Claude Code:** start a fresh session (or `/clear`) per item below. Reference the item by number/name instead of re-explaining it — e.g. "work on Phase 1, item 2." Commit after each item is done and verified so progress persists independent of conversation history.

---

## Phase 1 — Critical fixes (do first, highest visibility)

- [x] **1. Fix horizontal overflow on Browse and Component Detail pages** — filter panel, badges, and stats are clipped off the right edge of the viewport. Likely a missing `max-width`/`overflow-x` constraint on a container. Verify visually in-browser, not just via diff, since this bug is invisible in code review.
  - Added `overflow-x: hidden` to `html, body` in `StoreHUBClient/app/globals.css`; added `min-w-0` to the grid-column divs in `app/components/[slug]/page.tsx` that lacked it.
- [x] **2. Fix Builds tab showing "No builds yet" for components with completed successful builds** — data mismatch between `ListBuildsForVersion` query and stored build records. Check version-string matching / field names.
  - Actual cause: `GET /builds/:id` and `GET /components/:slug/versions/:version/builds` required JWT auth; frontend silently treated 401/no-token as an empty list. Moved both routes to the public group in `internal/routes/routes.go` and made `authToken` optional in `buildApi`/`useBuilds`/`useBuildStatus`.

## Phase 2 — Implementation improvements (existing features)

- [x] **3. Stream build logs live in the UI** — backend already pushes rich step-by-step logs (`[STEP]`, `[DEBUG]`, `[SUCCESS]`) to `BuildJob.logs`; currently unused by the frontend. Poll or stream this while a build runs.
  - `useBuilds` now polls every 3s while any build in the list is `queued`/`running`, refreshing status and logs until resolved.
- [x] **4. Fix or remove the "Install command" widget** (`npx storehubx install ...`) — implies a real CLI that doesn't exist; either build a minimal real CLI or relabel/remove it.
  - Replaced with a real `git clone https://github.com/<owner>/<repo>.git` command sourced from the component's linked repo (`components/common/install-command.tsx`); only renders when a repo is actually linked.
- [x] **5. Improve search relevance** — replace `$regex` scan over name/description/tags with a Mongo text index (or dedicated search service) for real ranking and typo tolerance.
  - Added a weighted text index (name > tags > description) in `internal/db/indexes.go`; `GetAllComponents` now uses `$text`/`$search` via an aggregation pipeline sorted by `textScore` when `q` is set, falling back to `createdAt desc` otherwise.

## Phase 3 — System design / scaling

- [x] **6. Add retry + exponential backoff for failed build jobs** — builds directly on the per-job timeout added recently; currently a failed job just dies with no retry.
  - Added `Attempts`/`MaxAttempts`/`NextAttemptAt` to `BuildJob`; `worker.fail()` now requeues with `10s * 2^attempt` backoff (capped at 2m) up to `MaxAttempts` (default 3) before setting `BuildError`.
- [x] **7. Add a caching layer (Redis) in front of `GET /components` and `GET /components/:slug`** — read-heavy, write-rare endpoints.
  - New `internal/cache` package (self-hosted Redis via docker-compose). List cache invalidates via an epoch counter bumped on any component write; per-slug cache invalidates on likes/repo-link changes and on new unique visitors. Degrades gracefully to no-cache if Redis is unreachable.
- [x] **8. Move the build queue off Mongo polling** onto a real queue (Redis/RabbitMQ/SQS) — reduces DB load, adds proper at-least-once delivery semantics.
  - `EnqueueBuild`/`AddVersion`/`AutoDeploy` now `XADD` to a `builds:stream` Redis Stream; the worker blocks on `XREADGROUP` for near-instant pickup, with a slower (30s) Mongo poll kept as a fallback sweep for retries and dropped messages. Falls back entirely to the original fast poll when Redis isn't configured.
- [x] **9. Put a CDN in front of MinIO/S3** for built component bundles — improves preview load time.
  - `s3.go`'s `publicURL()` now honors `CDN_BASE_URL` when set. Code-side only — actually fronting MinIO with a CDN (e.g. Cloudflare) requires a domain/account on the user's side.
- [x] **10. Add build pipeline observability/metrics** (success/failure rate, queue depth, build duration) — currently just a console heartbeat print.
  - New `internal/metrics` package (Prometheus client) exposing `GET /metrics`; instrumented in the worker's success/fail paths and heartbeat. Added self-hosted `prometheus`+`grafana` services to `docker-compose.yml`.

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
