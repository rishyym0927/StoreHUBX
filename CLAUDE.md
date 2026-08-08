# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is a two-service monorepo, each with its own dependency management and dev server:

- `StoreHUBXBackend/` — Go (Fiber) API + background worker, MongoDB + MinIO (S3-compatible) storage
- `StoreHUBClient/` — Next.js 15 (App Router, React 19) frontend

There is no root-level build tool; each service is run independently from its own directory.

## Commands

### Backend (`StoreHUBXBackend/`)

```bash
docker-compose up -d          # start MongoDB, MinIO, Redis, Prometheus, Grafana
go mod download
go run cmd/main.go            # API server on :8080 (Swagger at /docs/index.html, metrics at /metrics)
go run cmd/worker/main.go     # background build worker (separate process)
```

`docker-compose.yml` also starts Redis (cache + build queue), Prometheus (`:9090`), and Grafana (`:3001`, `admin`/`admin`, dashboards auto-provisioned from `grafana/provisioning/`) — see the observability section below.

Config comes from `.env` (copy `.env.example`), loaded via `internal/config`. `MONGO_URI` is required — the process calls `log.Fatal` if it's unset. Required GitHub OAuth vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URL`. `REDIS_ADDR` is optional — caching and the fast build-notification path degrade gracefully to no-cache/poll-only when Redis isn't reachable. `CDN_BASE_URL` is optional and overrides `S3_PUBLIC_BASE_URL` for bundle URLs when set.

One-off maintenance scripts live under `cmd/`: `cmd/fix_bucket_policy`, `cmd/fix_html_urls`, `cmd/fix_mime_types` (run with `go run cmd/<name>/main.go`).

No test suite currently exists in the backend.

### Frontend (`StoreHUBClient/`)

```bash
npm install
npm run dev      # localhost:3000
npm run build
npm run lint
```

Requires `NEXT_PUBLIC_API_BASE` in `.env.local` (e.g. `http://localhost:8080`), pointing at the backend API base URL used by `lib/api.ts`.

No test suite currently exists in the frontend.

## Architecture

### Backend: request flow and build pipeline

Fiber app (`cmd/main.go`) wires global middleware (CORS, recover, request logger, `middleware.RateLimiter`) and delegates routing to `internal/routes/routes.go`, which is the single source of truth for the route table — check it first when tracing any endpoint. Routes split into: fully public reads (components list/get, versions, comments, ratings, builds, preview redirect, the GitHub push webhook), public-but-identity-aware reads behind `middleware.OptionalAuth` (`GET /components/:slug`, `GET /users/:id` — parses a bearer token if present but never rejects, so an owner/collaborator sees their own private components while everyone else gets a 404), and an `/api` group behind `middleware.JWTProtected` for everything else (writes, likes, comments, ratings, GitHub linking, deploys, builds, visibility/collaborators, profile, analytics).

Auth is GitHub OAuth (`internal/auth/oauth.go`) exchanged for a JWT (`internal/auth/jwt.go`); the JWT is what protects the `/api` group and its claims (`user_id`, `email`) are attached to `c.Locals` by both `JWTProtected` and `OptionalAuth`.

Components can be linked to a GitHub repo/path/ref (`internal/handlers/component_link_handler.go`, which also generates a per-link `RepoLink.WebhookSecret`), and building a version is an async job, not a synchronous request:

1. `POST /api/components/:slug/versions/:version/build` (or `AddVersion`/`AutoDeploy`/the GitHub push webhook) first checks `internal/handlers/build_cache.go`'s `findCachedBuild` — if the same component already has another version built successfully from the identical `commitSha`, its `previewUrl`/`buildState` are copied onto the new version and no job is created. Otherwise a `BuildJob` is inserted into MongoDB (`internal/models/build_job.go`) via `internal/handlers/build.go`, and `notifyWorker` pushes the job id onto the `builds:stream` Redis Stream for near-instant pickup.
2. The separate `cmd/worker/main.go` process (`internal/worker/worker.go`) primarily blocks on `XREADGROUP` against that stream, with a slower (30s) Mongo poll kept as a fallback sweep for retries and any dropped stream messages (falls back to poll-only if Redis isn't configured). It claims a job atomically via `FindOneAndUpdate`, then: downloads the linked GitHub repo as a zip (preferring `Repo.Commit`, then `Ref`), unzips it, runs an npm build (or falls back to serving static files) via `internal/worker/fs_build.go`, rewrites `index.html`/asset paths, and uploads the output to S3/MinIO (`internal/storage`).
3. Progress is streamed by pushing log lines onto the `BuildJob.logs` array in Mongo as the job runs; status transitions are `BuildQueued -> BuildRunning -> BuildSuccess|BuildError`. A failed job is requeued with exponential backoff (`Attempts`/`MaxAttempts`/`NextAttemptAt`, `10s * 2^attempt` capped at 2m) instead of failing permanently until `MaxAttempts` is hit. On success the corresponding `ComponentVersion` is patched with `previewUrl` and `buildState`.
4. `GET /builds/:id` and `GET /components/:slug/versions/:version/builds` (both public, no auth) let the frontend poll job status/logs.
5. Every success/failure and the current queue depth are recorded as Prometheus metrics (`internal/metrics`, scraped at `GET /metrics`) — `storehubx_builds_total{status}`, `storehubx_build_queue_depth`, `storehubx_build_duration_seconds`. A Grafana dashboard for these is auto-provisioned from `StoreHUBXBackend/grafana/provisioning/` (datasource + `build-pipeline.json`) when `docker-compose.yml`'s `grafana` service starts.

Because the API server and worker are separate binaries/processes, any change to `BuildJob` fields or status semantics must stay in sync across `internal/handlers/build.go` and `internal/worker/worker.go`.

Storage is abstracted behind the `storage.Uploader` interface (`internal/storage/storage.go`, implemented by `internal/storage/s3.go` for MinIO/S3) — build output publishing goes through `PublishComponentFromDist`, which also rewrites asset paths so uploaded bundles are served correctly. `publicURL()` honors `CDN_BASE_URL` when set, falling back to `S3_PUBLIC_BASE_URL`.

`internal/cache` (Redis) fronts `GET /components` and `GET /components/:slug`: the list cache is invalidated via an epoch counter bumped on any component write, the per-slug cache via `invalidateComponentCaches` on likes/ratings/repo-link/visibility changes. Both degrade gracefully to no-cache if Redis is unreachable. Private components (see below) skip the Redis fast-path read/write entirely since serving a cached blob would bypass the per-request authorization check.

Component visibility (`internal/handlers/component_visibility_handler.go`) adds a `Visibility` (`"public"|"private"`) and `Collaborators []string` to `Component`; `GET /components` always excludes private docs, `GET /components/:slug` and `GET /users/:id` use `OptionalAuth` to allow the owner/a collaborator through. Ratings (`internal/handlers/rating_handler.go`, `internal/models/rating.go`) are upserted one-per-user-per-component and denormalize `Component.AverageRating`/`RatingCount`, mirroring the existing likes pattern. Owner analytics (`internal/handlers/analytics_handler.go`) aggregate view/like/rating/comment totals per owned component — MVP totals only, no time-series tracking.

Response shape is consistent across all handlers: `{"success": true, "data": ...}` or `{"success": false, "error": ...}`, enforced via helpers in `internal/utils/response.go`.

### Frontend: API + auth pattern

`lib/api.ts` is the single typed API client (`apiFetch<T>`) — all backend calls go through it, using `NEXT_PUBLIC_API_BASE` and normalizing errors into `ApiError`. Request/response types live in `types/index.ts` and mirror the backend's Go models/response envelopes; when the backend response shape changes, update both.

Auth state (JWT + user) is a persisted Zustand store (`lib/store.ts`, `useAuth`), not React context — components read the token from this store and pass it as `authToken` into `apiFetch` calls for protected endpoints. `hooks/use-api.ts` wraps common data-fetching patterns on top of `lib/api.ts`.

Routing uses the App Router with a `(private)` route group (`app/(private)/`) for authenticated pages (component creation, `/me`, `/me/analytics`) versus public component/user browsing pages (`app/components`, `app/users`) — check which group a page belongs in before adding new routes, since it determines whether auth is expected to already be present client-side.

Icons are `lucide-react` throughout (no emoji, no ad-hoc inline SVGs for generic icons — hand-drawn brand marks like the GitHub logo are the exception). Shared brutalist-styled UI primitives live in `components/common/`: `badge.tsx` (framework/tag chips), `pagination.tsx`, `rating-stars.tsx`, `component-card-skeleton.tsx` — reuse these instead of hand-rolling equivalents.
