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
