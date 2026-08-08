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
docker-compose up -d          # start MongoDB + MinIO
go mod download
go run cmd/main.go            # API server on :8080 (Swagger at /docs/index.html)
go run cmd/worker/main.go     # background build worker (separate process, polls MongoDB)
```

Config comes from `.env` (copy `.env.example`), loaded via `internal/config`. `MONGO_URI` is required — the process calls `log.Fatal` if it's unset. Required GitHub OAuth vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URL`.

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

Fiber app (`cmd/main.go`) wires global middleware (CORS, recover, request logger) and delegates routing to `internal/routes/routes.go`, which is the single source of truth for the route table — check it first when tracing any endpoint. Routes split into public reads (components, versions, comments, preview redirect) and a `/api` group behind `middleware.JWTProtected` for writes (create component, versions, likes, comments, GitHub linking, deploys, builds, profile).

Auth is GitHub OAuth (`internal/auth/oauth.go`) exchanged for a JWT (`internal/auth/jwt.go`); the JWT is what protects the `/api` group.

Components can be linked to a GitHub repo/path/ref (`internal/handlers/component_link_handler.go`), and building a version is an async job, not a synchronous request:

1. `POST /components/:slug/versions/:version/build` enqueues a `BuildJob` in MongoDB (`internal/models/build_job.go`) via `internal/handlers/build.go`.
2. The separate `cmd/worker/main.go` process (`internal/worker/worker.go`) polls Mongo for `BuildQueued` jobs, claims one atomically via `FindOneAndUpdate`, then: downloads the linked GitHub repo as a zip, unzips it, runs an npm build (or falls back to serving static files) via `internal/worker/fs_build.go`, rewrites `index.html`/asset paths, and uploads the output to S3/MinIO (`internal/storage`).
3. Progress is streamed by pushing log lines onto the `BuildJob.logs` array in Mongo as the job runs; status transitions are `BuildQueued -> BuildRunning -> BuildSuccess|BuildError`. On success the corresponding `ComponentVersion` is patched with `previewUrl` and `buildState`.
4. `GET /builds/:id` and `GET /components/:slug/versions/:version/builds` let the frontend poll job status/logs.

Because the API server and worker are separate binaries/processes, any change to `BuildJob` fields or status semantics must stay in sync across `internal/handlers/build.go` and `internal/worker/worker.go`.

Storage is abstracted behind the `storage.Uploader` interface (`internal/storage/storage.go`, implemented by `internal/storage/s3.go` for MinIO/S3) — build output publishing goes through `PublishComponentFromDist`, which also rewrites asset paths so uploaded bundles are served correctly.

Response shape is consistent across all handlers: `{"success": true, "data": ...}` or `{"success": false, "error": ...}`, enforced via helpers in `internal/utils/response.go`.

### Frontend: API + auth pattern

`lib/api.ts` is the single typed API client (`apiFetch<T>`) — all backend calls go through it, using `NEXT_PUBLIC_API_BASE` and normalizing errors into `ApiError`. Request/response types live in `types/index.ts` and mirror the backend's Go models/response envelopes; when the backend response shape changes, update both.

Auth state (JWT + user) is a persisted Zustand store (`lib/store.ts`, `useAuth`), not React context — components read the token from this store and pass it as `authToken` into `apiFetch` calls for protected endpoints. `hooks/use-api.ts` wraps common data-fetching patterns on top of `lib/api.ts`.

Routing uses the App Router with a `(private)` route group (`app/(private)/`) for authenticated pages (component creation, `/me`) versus public component/user browsing pages (`app/components`, `app/users`) — check which group a page belongs in before adding new routes, since it determines whether auth is expected to already be present client-side.
