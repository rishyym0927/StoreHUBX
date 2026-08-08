# 🚀 StoreHUBX

**StoreHUBX** is a modern component repository platform. It allows developers to publish, discover, preview, and manage reusable UI components by directly linking to GitHub repositories.

Beyond the core publish/discover/preview flow, it also supports: ratings & reviews, likes and comments, private/team-visible components with per-component collaborators, webhook-based auto-deploy on GitHub push (with manual auto-deploy and build caching by commit SHA as alternatives), an owner-facing usage analytics dashboard, and build-pipeline observability via Prometheus + Grafana.

---

## 🛠 Prerequisites

Ensure you have the following installed on your machine:
- **Go 1.25+**
- **Node.js 20+**
- **Docker & Docker Compose**
- **Git**

---

## 🚀 Installation & Running Locally

### Quick start (recommended)

From the repo root:

```bash
make install   # go mod download + npm install, scaffolds .env / .env.local if missing
```

Open `StoreHUBXBackend/.env` and fill in `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (create an OAuth App at https://github.com/settings/developers), then:

```bash
make dev
```

This starts everything — Docker infra, the hot-reloading API, the hot-reloading worker, and the frontend — in one terminal. Logs are interleaved with timestamped `[api]`/`[worker]`/`[web]` prefixes; `Ctrl+C` stops everything. The Go API and worker hot-reload on save via [`air`](https://github.com/air-verse/air) (auto-installed on first run if missing).

Before starting anything, `make dev` runs a preflight check (`make check`) that verifies required tools, the Docker daemon, `.env`/`.env.local` values (rejecting unset or placeholder secrets), and that ports 8080/3000/27017/9000/6379 are free — each problem is reported as a clear `✗ file: what's wrong. how to fix it` line instead of failing later with a cryptic runtime error. Run `make check` on its own any time to just validate your setup.

Other targets: `make infra` (Docker services only), `make backend` (API + worker only), `make frontend` (Next.js only), `make stop` (stop Docker infra).

If you'd rather run each piece in its own terminal for isolated logs, see the manual steps below.

### 1. Start External Services (Database, Storage, Cache, Observability)
We use Docker to run MongoDB, MinIO, Redis, Prometheus, and Grafana locally.
```bash
cd StoreHUBXBackend
docker-compose up -d
```
> **Note:** Access the MinIO Console at http://localhost:9001 and login with `minioadmin` / `minioadmin`. Ensure a bucket named `storehub` exists. Redis (`:6379`) backs the API cache and the build queue — the backend degrades gracefully to no-cache/poll-only if it's unreachable, so it's optional but recommended. Grafana (`http://localhost:3001`, `admin`/`admin`) comes with a build-pipeline dashboard auto-provisioned against Prometheus (`:9090`).

### 2. Configure Environment Variables
You need to configure the backend and frontend variables.

**Backend Configuration:**
```bash
cd StoreHUBXBackend
cp .env.example .env
```
> Make sure to open the `.env` file and fill out your `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (which you can get by creating an OAuth App on GitHub).

**Frontend Configuration:**
Create an `.env.local` file inside your `StoreHUBClient` folder:
```env
NEXT_PUBLIC_API_BASE=http://localhost:8080
```

### 3. Run the Backend API 
Open a new terminal window:
```bash
cd StoreHUBXBackend
go mod download
go run cmd/main.go
```
> The API will be available at `http://localhost:8080` (with documentation at `/docs/index.html`).

### 4. Run the Background Worker
In another terminal window, start the background worker needed to build components:
```bash
cd StoreHUBXBackend
go run cmd/worker/main.go
```

### 5. Run the Frontend App
In a final terminal window, launch the Next.js UI:
```bash
cd StoreHUBClient
npm install
npm run dev
```
> The frontend will be available at `http://localhost:3000`.
