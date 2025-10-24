# 🚀 StoreHUBX - Component Repository Platform

**StoreHUBX** is a comprehensive platform for publishing, discovering, and managing reusable UI components. It allows developers to share components across frameworks, link them to GitHub repositories, build and preview them automatically, and manage multiple versions with ease.

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Setup MongoDB & MinIO](#2-setup-mongodb--minio)
  - [3. Setup Backend Environment](#3-setup-backend-environment)
  - [4. Setup Frontend Environment](#4-setup-frontend-environment)
  - [5. Run the Backend API](#5-run-the-backend-api)
  - [6. Run the Worker](#6-run-the-worker)
  - [7. Run the Frontend](#7-run-the-frontend)
- [Detailed Setup Guide](#-detailed-setup-guide)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Docker Services](#docker-services)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Development Workflow](#-development-workflow)
- [Building for Production](#-building-for-production)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

StoreHUBX consists of three main components:

1. **Frontend (Next.js)**: A modern React-based web interface for browsing and managing components
2. **Backend API (Go + Fiber)**: RESTful API server handling authentication, component management, and GitHub integration
3. **Worker (Go)**: Background job processor that builds components from GitHub repositories and uploads artifacts to S3-compatible storage

---

## 🏗️ Architecture

```
┌─────────────────┐
│  Next.js App    │ ← Users interact via browser
│  (Frontend)     │
└────────┬────────┘
         │ REST API
         ▼
┌─────────────────┐       ┌──────────────┐
│  Fiber API      │◄─────►│   MongoDB    │
│  (Go Backend)   │       │  (Database)  │
└────────┬────────┘       └──────────────┘
         │
         │ Enqueue Build Jobs
         ▼
┌─────────────────┐       ┌──────────────┐
│  Worker         │◄─────►│ MinIO/S3     │
│  (Go Service)   │       │  (Storage)   │
└─────────────────┘       └──────────────┘
         │
         └────► Builds & Uploads Components
```

**Flow:**
1. Users authenticate via GitHub OAuth
2. Users create components and versions through the frontend
3. Users link components to GitHub repositories
4. Build jobs are queued when versions are created
5. Worker processes jobs: clones repo, builds components, uploads to S3
6. Built components are accessible via public preview URLs

---

## ✨ Features

- 🔐 **GitHub OAuth Authentication** - Secure login with GitHub
- 📦 **Component Management** - Create, version, and organize UI components
- 🔗 **GitHub Integration** - Link components to GitHub repositories
- 🏗️ **Automated Builds** - Worker service builds components from source
- 🎨 **Live Previews** - View components in sandboxed iframes
- 🔍 **Search & Filter** - Find components by framework, tags, and more
- 📝 **Markdown Support** - Rich documentation with README and changelogs
- 🎯 **Multi-Framework** - Support for React, Vue, Svelte, and more
- 📊 **Build Status Tracking** - Real-time build logs and status
- 🌙 **Dark Mode** - Beautiful UI with light/dark theme support

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives
- **Zustand** - State management
- **React Markdown** - Markdown rendering

### Backend
- **Go 1.24** - High-performance backend language
- **Fiber v2** - Express-inspired web framework
- **MongoDB** - Document database
- **MinIO** - S3-compatible object storage
- **JWT** - Authentication tokens
- **Swagger** - API documentation

### Infrastructure
- **Docker** - Container orchestration
- **GitHub API** - Repository integration

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Go 1.24+** - [Download](https://golang.org/dl/)
- **Node.js 20+** - [Download](https://nodejs.org/)
- **npm/yarn/pnpm** - Package manager
- **MongoDB** - [Download](https://www.mongodb.com/try/download/community) or use Docker
- **Docker & Docker Compose** - [Download](https://www.docker.com/get-started) (for MinIO)
- **Git** - [Download](https://git-scm.com/)

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/rishyym0927/StoreHUBX.git
cd StoreHUBX
```

### 2. Setup MongoDB & MinIO

Start MongoDB and MinIO using Docker Compose:

```bash
cd StoreHUBXBackend
docker-compose up -d
```

This will start:
- **MongoDB** on `localhost:27017` (if you add it to docker-compose.yml)
- **MinIO** on `localhost:9000` (API) and `localhost:9001` (Console)

Access MinIO Console at http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin`

### 3. Setup Backend Environment

Create a `.env` file in the `StoreHUBXBackend` directory:

```bash
cd StoreHUBXBackend
touch .env
```

Add the following environment variables:

```env
# Server Configuration
PORT=8080

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/storehubx
MONGO_DB=storehubx

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# GitHub OAuth Configuration
# Create a GitHub OAuth App at: https://github.com/settings/developers
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URL=http://localhost:8080/auth/github/callback

# S3/MinIO Configuration
S3_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=storehubx
S3_PUBLIC_BASE_URL=http://localhost:9000/storehubx

# Worker Configuration
BUILD_TMP_DIR=/tmp/storehubx-builds
JOB_POLL_INTERVAL_MS=1000
```

**Important: GitHub OAuth Setup**

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: StoreHUBX Local
   - **Homepage URL**: http://localhost:3000
   - **Authorization callback URL**: http://localhost:8080/auth/github/callback
4. Copy the `Client ID` and `Client Secret` to your `.env` file

### 4. Setup Frontend Environment

Create a `.env.local` file in the `StoreHUBClient` directory:

```bash
cd ../StoreHUBClient
touch .env.local
```

Add the following environment variables:

```env
NEXT_PUBLIC_API_BASE=http://localhost:8080
```

### 5. Run the Backend API

```bash
cd StoreHUBXBackend

# Install Go dependencies
go mod download

# Build the API server
go build -o bin/api cmd/main.go

# Run the API server
./bin/api
```

Or run directly without building:

```bash
go run cmd/main.go
```

The API will be available at http://localhost:8080

**API Documentation (Swagger)**: http://localhost:8080/docs/index.html

### 6. Run the Worker

Open a new terminal window:

```bash
cd StoreHUBXBackend

# Build the worker
go build -o bin/worker cmd/worker/main.go

# Run the worker
./bin/worker
```

Or run directly:

```bash
go run cmd/worker/main.go
```

The worker will start polling for build jobs and process them automatically.

### 7. Run the Frontend

Open another terminal window:

```bash
cd StoreHUBClient

# Install dependencies
npm install
# or
yarn install
# or
pnpm install

# Run the development server
npm run dev
# or
yarn dev
# or
pnpm dev
```

The frontend will be available at http://localhost:3000

---

## 📚 Detailed Setup Guide

### Backend Setup

#### Directory Structure

```
StoreHUBXBackend/
├── cmd/
│   ├── main.go              # API server entry point
│   ├── worker/
│   │   └── main.go          # Worker entry point
│   └── fix_*/               # Utility scripts
├── internal/
│   ├── auth/                # OAuth & JWT handling
│   ├── config/              # Configuration management
│   ├── db/                  # MongoDB connection & indexes
│   ├── github/              # GitHub API integration
│   ├── handlers/            # HTTP request handlers
│   ├── middleware/          # Auth, logging, rate limiting
│   ├── models/              # Data models
│   ├── routes/              # Route definitions
│   ├── storage/             # S3/MinIO integration
│   ├── utils/               # Helper functions
│   └── worker/              # Build job processor
├── docs/                    # Swagger documentation
├── docker-compose.yml       # Docker services
├── go.mod                   # Go dependencies
└── .env                     # Environment variables
```

#### Building the Backend

```bash
# Build API server
go build -o bin/api cmd/main.go

# Build worker
go build -o bin/worker cmd/worker/main.go

# Build all
mkdir -p bin
go build -o bin/api cmd/main.go
go build -o bin/worker cmd/worker/main.go
```

#### Running Tests

```bash
go test ./... -v
```

#### Generating Swagger Docs

If you modify API endpoints:

```bash
# Install swag CLI
go install github.com/swaggo/swag/cmd/swag@latest

# Generate docs
swag init -g cmd/main.go -o docs
```

### Frontend Setup

#### Directory Structure

```
StoreHUBClient/
├── app/
│   ├── page.tsx                    # Home page
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles
│   ├── (private)/                  # Protected routes
│   │   ├── components/[slug]/      # Component management
│   │   └── me/                     # User profile
│   ├── auth/callback/              # OAuth callback
│   ├── components/[slug]/          # Public component pages
│   └── users/[id]/                 # User profiles
├── components/
│   ├── common/                     # Shared components
│   ├── layout/                     # Layout components
│   └── ui/                         # UI components
├── lib/
│   ├── api.ts                      # API client
│   ├── store.ts                    # Zustand store
│   └── utils.ts                    # Utilities
├── types/
│   └── index.ts                    # TypeScript types
├── public/                         # Static assets
└── .env.local                      # Environment variables
```

#### Available Scripts

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

### Docker Services

#### Starting Services

```bash
cd StoreHUBXBackend
docker-compose up -d
```

#### Stopping Services

```bash
docker-compose down
```

#### Viewing Logs

```bash
docker-compose logs -f minio
```

#### MinIO Console

Access at http://localhost:9001
- Create a bucket named `storehubx`
- Set bucket policy to public read (or the API will do this automatically)

---

## 📖 API Documentation

### Base URL

```
http://localhost:8080
```

### Swagger Documentation

Interactive API documentation is available at:

```
http://localhost:8080/docs/index.html
```

### Key Endpoints

#### Authentication

- `GET /auth/github/login` - Initiate GitHub OAuth
- `GET /auth/github/callback` - OAuth callback

#### Components (Public)

- `GET /components` - List all components
- `GET /components/:slug` - Get component details
- `GET /components/:slug/versions` - Get component versions

#### Components (Protected)

All require `Authorization: Bearer <token>` header:

- `POST /api/components` - Create component
- `POST /api/components/:slug/link` - Link to GitHub repo
- `POST /api/components/:slug/versions` - Add version
- `POST /api/components/:slug/versions/:version/build` - Trigger build

#### Builds (Protected)

- `GET /api/builds/:id` - Get build status
- `GET /api/components/:slug/versions/:version/builds` - List builds

#### GitHub Integration (Protected)

- `GET /api/github/repos` - List user's repositories
- `GET /api/github/contents` - Get repository contents
- `GET /api/github/branches` - Get branch info

#### User

- `GET /api/me` - Get authenticated user profile
- `GET /users/:id` - Get public user profile

---

## 🗂️ Project Structure

### Data Models

#### Component

```typescript
{
  id: string
  name: string
  slug: string
  description: string
  frameworks: string[]
  tags: string[]
  license: string
  ownerId: string
  repoLink?: {
    owner: string
    repo: string
    path: string
    ref: string
    commit: string
  }
  createdAt: Date
  updatedAt: Date
}
```

#### Component Version

```typescript
{
  id: string
  componentId: string
  version: string
  changelog: string
  readme: string
  codeUrl: string
  previewUrl?: string
  buildState: "none" | "queued" | "running" | "ready" | "error"
  createdBy: string
  createdAt: Date
}
```

#### Build Job

```typescript
{
  id: string
  componentId: string
  component: string
  version: string
  status: "queued" | "running" | "success" | "error"
  ownerId: string
  repo: {
    owner: string
    repo: string
    path: string
    ref: string
    commit: string
  }
  artifacts?: {
    bundleUrl: string
  }
  logs: string[]
  createdAt: Date
  updatedAt: Date
  startedAt?: Date
  endedAt?: Date
}
```

---

## 🔄 Development Workflow

### Creating a Component

1. **Sign in** with GitHub
2. **Create Component**: Go to "New Component", fill in details
3. **Link Repository**: Link to GitHub repo and select folder
4. **Add Version**: Create version with changelog
5. **Build**: Build is automatically triggered
6. **Preview**: View live preview once build completes

### How Builds Work

1. User adds a version or triggers a build
2. API creates a build job with status `queued`
3. Worker picks up the job and sets status to `running`
4. Worker:
   - Downloads repository ZIP
   - Extracts to temp directory
   - Runs `npm install && npm run build` (if package.json exists)
   - Falls back to serving files as-is if no build script
   - Modifies `index.html` to add component metadata
   - Uploads files to S3/MinIO with correct MIME types
   - Sets build status to `success` or `error`
5. Version's `previewUrl` is updated with the public URL
6. Users can view the component preview

### Worker Details

The worker (`cmd/worker/main.go`):
- Polls MongoDB every 1 second for queued jobs
- Processes jobs one at a time
- Logs heartbeat status every 30 seconds
- Handles both Node.js builds and static file serving
- Rewrites asset paths in HTML for proper loading
- Uploads with correct Content-Type headers

---

## 🏭 Building for Production

### Backend

```bash
cd StoreHUBXBackend

# Build both binaries
go build -o bin/api cmd/main.go
go build -o bin/worker cmd/worker/main.go

# Run in production
./bin/api &
./bin/worker &
```

**Production Checklist:**
- [ ] Set strong `JWT_SECRET`
- [ ] Use production MongoDB instance
- [ ] Use production S3/MinIO with proper credentials
- [ ] Configure GitHub OAuth with production URLs
- [ ] Set up proper logging and monitoring
- [ ] Use HTTPS for all endpoints
- [ ] Set appropriate CORS origins

### Frontend

```bash
cd StoreHUBClient

# Build for production
npm run build

# Start production server
npm start
```

Or deploy to Vercel:

```bash
vercel deploy --prod
```

**Production Checklist:**
- [ ] Update `NEXT_PUBLIC_API_BASE` to production API URL
- [ ] Enable proper error tracking
- [ ] Configure CDN for static assets
- [ ] Set up analytics
- [ ] Test OAuth flow with production URLs

---

## 🐛 Troubleshooting

### Backend Issues

**MongoDB Connection Failed**

```bash
# Check if MongoDB is running
docker ps | grep mongo

# Check connection string in .env
MONGO_URI=mongodb://localhost:27017/storehubx
```

**MinIO Connection Failed**

```bash
# Check if MinIO is running
docker ps | grep minio

# Access MinIO console and verify bucket exists
open http://localhost:9001
```

**Worker Not Processing Jobs**

```bash
# Check worker logs
./bin/worker

# Check MongoDB for queued jobs
mongo
use storehubx
db.build_jobs.find({status: "queued"})
```

**GitHub OAuth Not Working**

- Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- Check callback URL matches GitHub OAuth app settings
- Ensure `GITHUB_REDIRECT_URL` in .env matches callback URL

### Frontend Issues

**API Requests Failing**

```bash
# Check NEXT_PUBLIC_API_BASE in .env.local
NEXT_PUBLIC_API_BASE=http://localhost:8080

# Check if backend is running
curl http://localhost:8080/health
```

**Authentication Not Working**

- Clear browser cookies
- Check JWT token in browser's localStorage
- Verify backend OAuth configuration

**Build Errors**

```bash
# Clear cache and reinstall
rm -rf .next node_modules
npm install
npm run dev
```

### Common Issues

**Port Already in Use**

```bash
# Find process using port 8080
lsof -i :8080

# Kill process
kill -9 <PID>
```

**Permission Denied**

```bash
# Make binaries executable
chmod +x bin/api bin/worker
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Write clear commit messages
- Add tests for new features
- Update documentation
- Follow existing code style
- Run linters before committing

---

## 📄 License

This project is open source. Please check individual package licenses for dependencies.

---

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - The React Framework
- [Fiber](https://gofiber.io/) - Express-inspired Go web framework
- [MongoDB](https://www.mongodb.com/) - Document database
- [MinIO](https://min.io/) - High-performance object storage
- [Radix UI](https://www.radix-ui.com/) - Accessible component primitives
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

---

## 📞 Support

If you encounter any issues or have questions:

- Open an issue on GitHub
- Check the [API Documentation](http://localhost:8080/docs/index.html)
- Review the [Backend README](StoreHUBXBackend/README.md)

---

## 🚀 What's Next?

Future enhancements:
- [ ] Component analytics and download stats
- [ ] Advanced search with filters
- [ ] Component ratings and reviews
- [ ] CLI tool for publishing components
- [ ] Webhook integration for automatic builds
- [ ] Multi-language support
- [ ] Component playground/sandbox
- [ ] Team collaboration features
- [ ] Private components support
- [ ] CDN integration for faster delivery

---

**Happy coding! 🎉**
