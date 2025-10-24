# StoreHUBX Quick Reference Guide

## 🚀 Quick Start Commands

### Starting Everything

```bash
# Option 1: Use the setup script (first time)
./setup.sh

# Option 2: Manual setup (subsequent runs)
# Terminal 1 - Start Docker services
cd StoreHUBXBackend && docker-compose up -d

# Terminal 2 - Start Backend API
cd StoreHUBXBackend && ./bin/api
# or: go run cmd/main.go

# Terminal 3 - Start Worker
cd StoreHUBXBackend && ./bin/worker
# or: go run cmd/worker/main.go

# Terminal 4 - Start Frontend
cd StoreHUBClient && npm run dev
```

### Building

```bash
# Build Backend
cd StoreHUBXBackend
go build -o bin/api cmd/main.go
go build -o bin/worker cmd/worker/main.go

# Build Frontend
cd StoreHUBClient
npm run build
```

---

## 🌐 URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Web interface |
| Backend API | http://localhost:8080 | REST API |
| API Docs | http://localhost:8080/docs/index.html | Swagger documentation |
| MinIO Console | http://localhost:9001 | Storage management |
| Health Check | http://localhost:8080/health | API health status |

---

## 🔑 Environment Variables

### Backend (.env)

```env
# Essential
PORT=8080
MONGO_URI=mongodb://localhost:27017/storehubx
MONGO_DB=storehubx
JWT_SECRET=your-secret-key

# GitHub OAuth (required)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URL=http://localhost:8080/auth/github/callback

# S3/MinIO
S3_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=storehubx
S3_PUBLIC_BASE_URL=http://localhost:9000/storehubx

# Worker
BUILD_TMP_DIR=/tmp/storehubx-builds
JOB_POLL_INTERVAL_MS=1000
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_BASE=http://localhost:8080
```

---

## 📡 API Endpoints Cheat Sheet

### Public Endpoints

```bash
# Get all components
GET /components?page=1&limit=10&q=search&framework=react

# Get component details
GET /components/:slug

# Get component versions
GET /components/:slug/versions

# Preview component
GET /preview/:slug/:version

# Health check
GET /health
```

### Protected Endpoints (Require JWT Token)

```bash
# Headers for all protected endpoints
Authorization: Bearer <jwt_token>

# Create component
POST /api/components
{
  "name": "MyComponent",
  "description": "Description",
  "frameworks": ["react"],
  "tags": ["ui"],
  "license": "MIT"
}

# Link component to GitHub
POST /api/components/:slug/link
{
  "owner": "username",
  "repo": "repository",
  "path": "packages/component",
  "ref": "main"
}

# Add version
POST /api/components/:slug/versions
{
  "version": "1.0.0",
  "changelog": "Initial release",
  "readme": "# Component\nDescription..."
}

# Trigger build
POST /api/components/:slug/versions/:version/build

# Get build status
GET /api/builds/:buildId

# List builds
GET /api/components/:slug/versions/:version/builds

# User profile
GET /api/me

# GitHub repos
GET /api/github/repos?page=1&per_page=30

# GitHub contents
GET /api/github/contents?owner=user&repo=repo&path=folder

# GitHub branches
GET /api/github/branches?owner=user&repo=repo&branch=main
```

---

## 🔧 Common Commands

### Docker

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f minio

# Restart services
docker-compose restart

# Remove all (including volumes)
docker-compose down -v
```

### MongoDB

```bash
# Connect to MongoDB (if installed locally)
mongosh

# Use database
use storehubx

# List collections
show collections

# Find components
db.components.find().pretty()

# Find build jobs
db.build_jobs.find({status: "queued"}).pretty()

# Count components
db.components.countDocuments()
```

### Go Backend

```bash
# Run with hot reload (install air first)
air

# Run tests
go test ./... -v

# Format code
go fmt ./...

# Update dependencies
go mod tidy

# Generate Swagger docs
swag init -g cmd/main.go -o docs

# Build for Linux
GOOS=linux GOARCH=amd64 go build -o bin/api-linux cmd/main.go

# Build for macOS
GOOS=darwin GOARCH=amd64 go build -o bin/api-macos cmd/main.go

# Build for Windows
GOOS=windows GOARCH=amd64 go build -o bin/api.exe cmd/main.go
```

### Next.js Frontend

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm run start

# Lint
npm run lint

# Clear cache
rm -rf .next node_modules
npm install

# Check bundle size
npm run build && npm run analyze
```

---

## 🐛 Debugging

### Check Service Status

```bash
# Backend API
curl http://localhost:8080/health

# MinIO
curl http://localhost:9000/minio/health/live

# MongoDB (requires mongosh)
mongosh --eval "db.adminCommand('ping')"
```

### View Logs

```bash
# Backend (if running in background)
tail -f /var/log/storehubx-api.log

# Worker (if running in background)
tail -f /var/log/storehubx-worker.log

# Docker services
docker-compose logs -f
```

### Common Issues

**Port already in use:**
```bash
# Find process
lsof -i :8080
lsof -i :3000

# Kill process
kill -9 <PID>
```

**Clear build cache:**
```bash
# Backend
go clean -cache -modcache -i -r

# Frontend
rm -rf .next node_modules package-lock.json
npm install
```

**Reset MinIO:**
```bash
cd StoreHUBXBackend
docker-compose down -v
docker-compose up -d
```

---

## 📊 Data Models Quick Reference

### Component
```typescript
{
  name: string           // Display name
  slug: string          // URL-safe identifier
  description: string   // Brief description
  frameworks: string[]  // ["react", "vue"]
  tags: string[]        // ["ui", "button"]
  license: string       // "MIT"
  ownerId: string       // User's provider ID
  repoLink?: {          // Optional GitHub link
    owner: string
    repo: string
    path: string
    ref: string
    commit: string
  }
}
```

### Version
```typescript
{
  componentId: string
  version: string       // "1.0.0"
  changelog: string     // What's new
  readme: string        // Documentation
  previewUrl?: string   // Live preview URL
  buildState: string    // "none" | "queued" | "running" | "ready" | "error"
}
```

### Build Job
```typescript
{
  component: string     // Component slug
  version: string       // Version number
  status: string        // "queued" | "running" | "success" | "error"
  repo: {
    owner: string
    repo: string
    path: string
    ref: string
  }
  logs: string[]        // Build logs
  artifacts?: {
    bundleUrl: string   // Public preview URL
  }
}
```

---

## 🔐 GitHub OAuth Setup

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: StoreHUBX Local
   - **Homepage URL**: http://localhost:3000
   - **Authorization callback URL**: http://localhost:8080/auth/github/callback
4. Copy Client ID and Secret to `.env`:
   ```env
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
   ```

---

## 📦 MinIO Setup

1. Access console: http://localhost:9001
2. Login: `minioadmin` / `minioadmin`
3. Create bucket: `storehubx`
4. Set policy to public read (or API does it automatically)

---

## 🧪 Testing the Setup

```bash
# 1. Health check
curl http://localhost:8080/health
# Expected: {"status":"ok"}

# 2. Get components (should be empty initially)
curl http://localhost:8080/components
# Expected: {"success":true,"data":{"components":[],...}}

# 3. Test frontend
curl http://localhost:3000
# Should return HTML

# 4. Test MinIO
curl http://localhost:9000/minio/health/live
# Expected: 200 OK
```

---

## 📈 Production Deployment Checklist

### Backend
- [ ] Set strong `JWT_SECRET`
- [ ] Use production MongoDB (MongoDB Atlas recommended)
- [ ] Use production S3 or MinIO with HTTPS
- [ ] Configure production GitHub OAuth app
- [ ] Enable CORS for production frontend domain
- [ ] Set up monitoring (Prometheus, Grafana)
- [ ] Configure log aggregation (ELK, Datadog)
- [ ] Set up backup strategy for MongoDB
- [ ] Use HTTPS/TLS for all endpoints
- [ ] Set up rate limiting and security headers
- [ ] Configure environment-specific configs
- [ ] Set up CI/CD pipeline

### Frontend
- [ ] Update `NEXT_PUBLIC_API_BASE` to production API
- [ ] Enable error tracking (Sentry)
- [ ] Set up analytics (Google Analytics, Plausible)
- [ ] Configure CDN (Vercel, Cloudflare)
- [ ] Optimize images and assets
- [ ] Enable production build optimizations
- [ ] Test OAuth flow with production URLs
- [ ] Set up custom domain
- [ ] Configure SEO meta tags
- [ ] Enable gzip/brotli compression

---

## 💡 Tips & Tricks

### Development

- Use `air` for Go hot reload: https://github.com/cosmtrek/air
- Use VS Code extensions:
  - Go extension
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
- Set up Git hooks with Husky for linting
- Use `make` or task runners for common commands

### Performance

- Backend: Use connection pooling for MongoDB
- Backend: Implement caching with Redis
- Frontend: Use Next.js Image component
- Frontend: Implement pagination for large lists
- Worker: Process multiple builds concurrently (with limits)

### Security

- Regularly update dependencies
- Use `dependabot` for automatic updates
- Implement rate limiting on API endpoints
- Validate and sanitize all user inputs
- Use prepared statements for database queries
- Implement CSRF protection
- Set secure HTTP headers

---

## 📚 Useful Resources

- [Go Documentation](https://go.dev/doc/)
- [Fiber Documentation](https://docs.gofiber.io/)
- [Next.js Documentation](https://nextjs.org/docs)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [MinIO Documentation](https://min.io/docs/minio/linux/index.html)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

## 🆘 Getting Help

1. Check README.md
2. Check API documentation at http://localhost:8080/docs/index.html
3. Search GitHub issues
4. Create a new GitHub issue with:
   - Your environment (OS, versions)
   - Steps to reproduce
   - Error messages/logs
   - Expected vs actual behavior

---

**Last Updated**: October 2025
