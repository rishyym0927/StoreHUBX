# 🚀 StoreHUBX

**StoreHUBX** is a modern component repository platform. It allows developers to publish, discover, preview, and manage reusable UI components by directly linking to GitHub repositories.

---

## 🛠 Prerequisites

Ensure you have the following installed on your machine:
- **Go 1.24+**
- **Node.js 20+**
- **Docker & Docker Compose**
- **Git**

---

## 🚀 Installation & Running Locally

### 1. Start External Services (Database & Storage)
We use Docker to run MongoDB and MinIO locally.
```bash
cd StoreHUBXBackend
docker-compose up -d
```
> **Note:** Access the MinIO Console at http://localhost:9001 and login with `minioadmin` / `minioadmin`. Ensure a bucket named `storehub` exists.

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
