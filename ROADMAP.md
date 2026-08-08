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

- [x] **11. Component ratings/reviews** (beyond likes).
  - Added `Rating` model (unique per componentId+userId) with `internal/handlers/rating_handler.go` (upsert/list/delete), denormalized `averageRating`/`ratingCount` on `Component` recalculated on every write. Frontend: `ratingApi`, `RatingStars`, `ComponentRatings` (review list + rate form) wired into the component detail page and card.
- [x] **12. Webhook-based auto-deploy** on GitHub push — upgrade from the current manual "Auto-Deploy" trigger.
  - Per-repo-link `WebhookSecret` (generated on link), public `POST /webhooks/github/:slug` verifying `X-Hub-Signature-256` via constant-time HMAC compare, reusing a shared `createVersionAndBuild` helper (extracted from `AutoDeploy`). Owner-only `GET /api/components/:slug/webhook` + a `WebhookSetup` frontend panel surface the URL/secret to copy into GitHub's webhook settings.
- [x] **13. Build caching by commit SHA** — skip rebuilding when the same commit is redeployed.
  - `internal/handlers/build_cache.go`'s `findCachedBuild` checks for another version of the same component already built successfully from the identical `commitSha`; wired into `createVersionAndBuild` (auto-deploy/webhook), `AddVersion`, and `EnqueueBuild` so a matching commit copies `previewUrl`/`buildState` instead of enqueuing a new `BuildJob`.
- [ ] **14. Private/team components** — visibility control beyond fully public.
- [ ] **15. Usage analytics dashboard** for component owners — view/like data is already tracked, just not visualized.
- [ ] **16. Set up Grafana dashboards for the Prometheus metrics from item 10** — Prometheus+Grafana are already running (`docker compose up`) and `/metrics` is exposing data, but no dashboard exists yet to actually look at it. Steps: open `http://localhost:3001` (admin/admin), add a Prometheus data source pointing at `http://prometheus:9090` (the in-network service name, not localhost), then create panels for `storehubx_builds_total` (rate, split by `status`), `storehubx_build_queue_depth` (gauge over time), and `storehubx_build_duration_seconds` (histogram/heatmap). Save it as a dashboard JSON under `StoreHUBXBackend/grafana/` so it's provisioned automatically instead of manually re-built every time `docker compose down -v` wipes the `grafana_data` volume.

### UI polish

The frontend already has an intentional "brutalist" black/white design system (Tailwind v4, hand-rolled — no shadcn/component library): 2px solid borders, hard offset drop-shadows on hover (`shadow-[8px_8px_0px_0px_...]` + lift), bold uppercase mono-font headings, sharp corners. Dark mode is already fully implemented via `next-themes` throughout. None of the items below are about changing that look — they're bugs, duplication, and consistency gaps found by reading the actual page/component files, to be fixed *within* the existing style.

- [ ] **17. Fix hardcoded `loggedInUserId` placeholder** in `app/components/page.tsx` (currently `"user-id-placeholder"`, marked TODO) — owner-only actions on the Browse page likely never activate correctly because of this.
- [ ] **18. Extract a reusable Badge/Tag chip component** — tag pills and framework chips are currently one-off `<span>` markup repeated across `component-card.tsx`, `[slug]/page.tsx`, and `components/page.tsx`; consolidate into one component using the existing border/mono-font style.
- [ ] **19. Dedupe pagination** — `components/common/pagination.tsx` already exists but `app/components/page.tsx` and `(private)/me/page.tsx` each hand-roll their own near-identical pagination controls instead of using it.
- [ ] **20. Replace ad-hoc emoji icons with a consistent icon set** — cards/pages mix emoji (🔍📦🎨⭐📍) with inline SVGs (GitHub/branch/commit icons); pick one (e.g. `lucide-react`, thin-stroke icons read well against the mono/brutalist style) and use it everywhere.
- [ ] **21. Resolve or remove the commented-out "Show Live Preview" toggle** on the home page (`app/page.tsx`) — currently dead code; either finish wiring it up or delete it.
- [ ] **22. Reconcile the two conflicting design-token sources** — `app/globals.css` (Tailwind v4, `--radius-xl: 0`, sharp corners) vs. the legacy `tailwind.config.js` (Tailwind v3-style, `borderRadius.xl: 1rem`) disagree on the signature "sharp corners" look; the config file appears to be leftover and should be removed once confirmed unused.
- [ ] **23. Broaden loading/empty states beyond the single pulse skeleton** — Browse grid and profile pages currently show a minimal centered emoji+text empty state; add skeleton cards matching the real card's border/shadow shape for a less jarring loading flash.
- [ ] **24. Align `app/users/[id]/page.tsx` with `lib/api.ts`** — it currently hand-rolls its own fetch/error parsing instead of using the existing `userApi` client used elsewhere, which is both a consistency and a maintainability issue.

---

## Already done (for reference, not re-work)

- Fixed `$addToSet` crash on fresh components (null `likedBy`/`uniqueVisitors` slices)
- Fixed worker hang with no timeout (added per-command and per-job timeouts)
- Wired up previously-unused `RateLimiter` middleware
- Removed dead code (`uploadFilesWithCorrectMimeTypes`, `stringsEqualFold`, obsolete one-off `cmd/fix_*` scripts)
