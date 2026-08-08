# StoreHUBX - Component Repository API

StoreHUBX is a platform for publishing, discovering, and managing reusable UI components. This document provides an overview of all available API endpoints, their request/response formats, and the underlying data models.

## Table of Contents

- [Authentication](#authentication)
- [API Response Format](#api-response-format)
- [API Endpoints](#api-endpoints)
  - [Auth](#auth)
  - [Health & Metrics](#health--metrics)
  - [Components](#components)
  - [Versions](#versions)
  - [Comments](#comments)
  - [Ratings](#ratings)
  - [Visibility & Collaborators](#visibility--collaborators)
  - [GitHub Integration](#github-integration)
  - [Builds & Webhooks](#builds--webhooks)
  - [User](#user)
- [Data Models](#data-models)
  - [Component Model](#component-model)
  - [Component Version Model](#component-version-model)
  - [Rating Model](#rating-model)
  - [Comment Model](#comment-model)
  - [User Model](#user-model)
  - [Build Job Model](#build-job-model)
- [Implementation Details](#implementation-details)

## Authentication

StoreHUBX uses GitHub OAuth for authentication and JWT tokens for API authorization.

### Authentication Flow

1. **GitHub Login**: Redirect users to `/auth/github/login`
2. **Callback**: GitHub redirects to `/auth/github/callback` with authorization code
3. **JWT Token**: Server generates a JWT token for API access
4. **API Requests**: Include the JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

Some public read routes (`GET /components/:slug`, `GET /users/:id`) accept an *optional* bearer token: if present and valid, the caller's identity is used to also reveal that caller's own private/collaborator components; if absent, the route still responds normally as an anonymous, public-only view.

## API Response Format

All API endpoints follow a consistent response format:

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data specific to each endpoint
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

## API Endpoints

### Auth

#### GitHub OAuth Login

- **GET** `/auth/github/login`
- **Description**: Redirects the user to GitHub for authentication
- **Response**: Redirects to GitHub OAuth page

#### GitHub OAuth Callback

- **GET** `/auth/github/callback`
- **Description**: Handles the OAuth callback from GitHub
- **Response**: JWT token for API access

### Health & Metrics

#### Check Service Health

- **GET** `/health`
- **Response**:
  ```json
  { "status": "ok" }
  ```

#### Prometheus Metrics

- **GET** `/metrics`
- **Description**: Prometheus exposition format for the build pipeline — `storehubx_builds_total{status}`, `storehubx_build_queue_depth`, `storehubx_build_duration_seconds`. Scraped by the `prometheus` service in `docker-compose.yml`; a Grafana dashboard for these is auto-provisioned (`grafana/provisioning/`, `http://localhost:3001`, `admin`/`admin`).

### Components

#### Get All Components

- **GET** `/components`
- **Description**: Retrieves a paginated list of **public** components with filtering options (private components never appear in this listing, regardless of caller)
- **Query Parameters**:
  - `q` (optional): Search term, matched via a weighted Mongo text index (name > tags > description) and ranked by relevance
  - `framework` (optional): Filter by framework (e.g., "react", "vue")
  - `tags` (optional): Filter by comma-separated tags (e.g., "ui,button")
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 10, max: 100)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "page": 1,
      "limit": 10,
      "total": 42,
      "components": [ /* Component objects, see Data Models */ ]
    }
  }
  ```

#### Get Component by Slug

- **GET** `/components/:slug` (public; accepts optional bearer token)
- **Description**: Retrieves detailed information about a specific component and records the caller as a unique visitor. Returns 404 for a private component unless the caller is the owner or a listed collaborator.
- **Response**:
  ```json
  { "success": true, "data": { "component": { /* Component object */ } } }
  ```

#### Create Component

- **POST** `/api/components` (Protected)
- **Request Body**:
  ```json
  {
    "name": "Button",
    "description": "A customizable button component",
    "frameworks": ["react", "vue"],
    "tags": ["ui", "form", "input"],
    "license": "MIT"
  }
  ```
- **Response**:
  ```json
  { "success": true, "data": { "status": "created", "component": { /* Component object */ } } }
  ```

#### Toggle Like

- **POST** `/api/components/:slug/like` (Protected)
- **Description**: Toggles the caller's like on/off (`Component.likedBy`/`likeCount`)
- **Response**:
  ```json
  { "success": true, "data": { "message": "like toggled", "component": { /* Component object */ } } }
  ```

#### Link Component to GitHub Repository

- **POST** `/api/components/:slug/link` (Protected)
- **Description**: Links a component to a GitHub repository/path/ref, generates a webhook secret for it (see [Builds & Webhooks](#builds--webhooks)), and auto-creates + builds an initial `1.0.0` version if none exist yet and a commit is provided
- **Request Body**:
  ```json
  {
    "owner": "username",
    "repo": "components",
    "path": "packages/button",
    "ref": "main",
    "commit": "a1b2c3d4e5f6"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "component": { /* Component object */ },
      "initialVersion": { /* ComponentVersion object, or null */ },
      "message": "Component linked successfully. Initial version created and build queued."
    }
  }
  ```

### Versions

#### Get Component Versions

- **GET** `/components/:slug/versions`
- **Response**:
  ```json
  { "success": true, "data": { "versions": [ /* ComponentVersion objects */ ] } }
  ```

#### Add Component Version

- **POST** `/api/components/:slug/versions` (Protected)
- **Description**: Adds a new version for a component that's already linked to a repo. Requires a commit SHA (explicit or inherited from the component's `repoLink.commit`) and rejects duplicate commits. If another version of the component was already built successfully from the same `commitSha`, that build's output is reused instead of enqueuing a new build.
- **Request Body**:
  ```json
  {
    "version": "1.1.0",
    "changelog": "Added size variants",
    "readme": "# Button\n\n...",
    "codeUrl": "https://github.com/username/components/tree/main/packages/button",
    "commitSha": "a1b2c3d4e5f6"
  }
  ```
- **Response**:
  ```json
  { "success": true, "data": { "status": "version added", "version": { /* ComponentVersion object */ }, "message": "Build queued automatically" } }
  ```

#### Auto-Deploy from a Commit

- **POST** `/api/components/:slug/deploy` (Protected)
- **Description**: Same version+build creation as above, but takes a raw commit SHA instead of a full version payload (auto-generates the next semver patch if `version` is omitted). This is also the internal path the GitHub push webhook reuses.
- **Request Body**:
  ```json
  { "commitSha": "a1b2c3d4e5f6", "version": "1.2.0", "changelog": "optional" }
  ```
- **Response**:
  ```json
  { "success": true, "data": { "version": { /* ComponentVersion object */ }, "jobId": "60d21b...", "message": "Version created and build queued automatically" } }
  ```

### Comments

#### List Comments

- **GET** `/components/:slug/comments`
- **Response**:
  ```json
  { "success": true, "data": { "comments": [ /* Comment objects */ ] } }
  ```

#### Add Comment

- **POST** `/api/components/:slug/comments` (Protected)
- **Request Body**: `{ "content": "Great component!" }`
- **Response**: `{ "success": true, "data": { "message": "comment added", "comment": { /* Comment object */ } } }`

#### Delete Comment

- **DELETE** `/api/components/:slug/comments/:commentId` (Protected, author-only)
- **Response**: `{ "success": true, "data": { "message": "comment deleted" } }`

### Ratings

#### List Ratings

- **GET** `/components/:slug/ratings`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "ratings": [ /* Rating objects */ ],
      "averageRating": 4.5,
      "ratingCount": 12
    }
  }
  ```

#### Upsert Rating

- **POST** `/api/components/:slug/ratings` (Protected)
- **Description**: Creates or updates the caller's own rating (one per user per component, `score` 1-5). Recalculates the component's denormalized `averageRating`/`ratingCount`.
- **Request Body**: `{ "score": 5, "review": "Optional review text" }`
- **Response**: `{ "success": true, "data": { "message": "rating saved", "rating": { /* Rating object */ } } }`

#### Delete Rating

- **DELETE** `/api/components/:slug/ratings` (Protected, own rating only)
- **Response**: `{ "success": true, "data": { "message": "rating deleted" } }`

### Visibility & Collaborators

#### Update Visibility

- **PATCH** `/api/components/:slug/visibility` (Protected, owner-only)
- **Request Body**: `{ "visibility": "private" }` (or `"public"`)
- **Response**: `{ "success": true, "data": { "message": "visibility updated", "visibility": "private" } }`

#### Add Collaborator

- **POST** `/api/components/:slug/collaborators` (Protected, owner-only)
- **Description**: Grants a GitHub provider ID access to view/see this component even while private
- **Request Body**: `{ "userId": "12345678" }`
- **Response**: `{ "success": true, "data": { "message": "collaborator added", "component": { /* Component object */ } } }`

#### Remove Collaborator

- **DELETE** `/api/components/:slug/collaborators/:userId` (Protected, owner-only)
- **Response**: `{ "success": true, "data": { "message": "collaborator removed", "component": { /* Component object */ } } }`

### GitHub Integration

#### List User's GitHub Repositories

- **GET** `/api/github/repos` (Protected)
- **Query Parameters**:
  - `page` (optional): Page number (default: 1)
  - `per_page` (optional): Items per page (default: 30)
  - `visibility` (optional): Filter by visibility (all/public/private)
  - `affiliation` (optional): Comma-separated list of values (owner,collaborator,organization_member)
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 123456789,
        "name": "components",
        "full_name": "username/components",
        "private": false,
        "html_url": "https://github.com/username/components",
        "description": "Collection of reusable UI components",
        "owner": { "login": "username", "id": 12345 },
        "default_branch": "main"
      }
    ]
  }
  ```

#### Get Repository Contents

- **GET** `/api/github/contents` (Protected)
- **Query Parameters**: `owner` (required), `repo` (required), `path` (optional, default root), `ref` (optional)
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      { "name": "button", "path": "packages/button", "sha": "a1b2c3d4e5f6", "type": "dir", "url": "...", "html_url": "..." }
    ]
  }
  ```

#### Get Branch Information

- **GET** `/api/github/branches` (Protected)
- **Query Parameters**: `owner` (required), `repo` (required), `branch` (optional, default `main`)
- **Response**:
  ```json
  { "success": true, "data": { "name": "main", "commit": { "sha": "a1b2c3d4e5f6", "url": "..." }, "protected": false } }
  ```

### Builds & Webhooks

#### Enqueue Component Build

- **POST** `/api/components/:slug/versions/:version/build` (Protected)
- **Description**: Manually (re-)triggers a build for an existing version. Reuses another version's output instead of building if one already succeeded from the same commit.
- **Response** (new build): `{ "success": true, "data": { "jobId": "60d21b...", "status": "queued" } }`
- **Response** (cache hit): `{ "success": true, "data": { "status": "cached", "message": "reused build output from an identical commit" } }`

#### Get Build Status

- **GET** `/builds/:id` (public, no auth required)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "build": {
        "id": "60d21b4667d0d8992e610c88",
        "componentId": "60d21b4667d0d8992e610c85",
        "component": "button",
        "version": "1.0.0",
        "status": "success",
        "ownerId": "123456789",
        "repo": { "owner": "username", "repo": "components", "path": "packages/button", "ref": "main", "commit": "a1b2c3d4e5f6" },
        "artifacts": { "bundleUrl": "https://storage.example.com/components/button/1.0.0/bundle.js" },
        "logs": ["enqueued", "cloning repository", "installing dependencies", "building component", "uploading artifacts", "build completed successfully"],
        "attempts": 0,
        "maxAttempts": 3,
        "createdAt": "2023-06-22T11:00:00Z",
        "updatedAt": "2023-06-22T11:05:30Z",
        "startedAt": "2023-06-22T11:00:10Z",
        "endedAt": "2023-06-22T11:05:30Z"
      }
    }
  }
  ```

#### List Builds for Version

- **GET** `/components/:slug/versions/:version/builds` (public, no auth required)
- **Response**: `{ "success": true, "data": { "builds": [ /* BuildJob objects, same shape as above */ ] } }`

#### GitHub Push Webhook

- **POST** `/webhooks/github/:slug` (public — authenticated via HMAC signature, not JWT)
- **Description**: Configure this as a GitHub repo webhook (`Content-Type: application/json`) to auto-deploy on every push to the linked branch, instead of manually calling Auto-Deploy. Verifies the `X-Hub-Signature-256` header against the component's `repoLink.webhookSecret` (constant-time HMAC-SHA256 compare) and rejects with 401 on mismatch. `ping` events are acknowledged; non-`push` events are ignored; pushes to a branch other than `repoLink.ref` (when one is pinned) are ignored; redelivery of an already-deployed commit responds 200 as a no-op.
- **Get webhook config**: **GET** `/api/components/:slug/webhook` (Protected, owner-only) returns `{ "webhookUrl": "...", "webhookSecret": "..." }` to paste into GitHub's webhook settings.

### User

#### Get Authenticated User Profile

- **GET** `/api/me` (Protected)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "user": { /* User object (public fields) */ },
      "components": [ /* all of this user's Component objects, including private */ ],
      "stats": { "totalComponents": 3 },
      "status": "authenticated"
    }
  }
  ```

#### Get User Profile by ID

- **GET** `/users/:id` (public; accepts optional bearer token)
- **Description**: Same shape as `GET /api/me`, for any user by GitHub provider ID. `components` includes the target user's private components only when the caller is that user or a collaborator on them; otherwise only public components are returned.
- **Response**: same shape as above, minus `status`.

#### Get Owner Analytics

- **GET** `/api/me/analytics` (Protected)
- **Description**: Aggregated view/like/rating/comment totals for every component the caller owns.
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "components": [
        { "slug": "button", "name": "Button", "viewCount": 120, "likeCount": 8, "averageRating": 4.5, "ratingCount": 12, "commentCount": 3 }
      ],
      "totals": { "componentCount": 1, "viewCount": 120, "likeCount": 8, "commentCount": 3 }
    }
  }
  ```

## Data Models

### Component Model

```go
type Component struct {
    ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    Name        string             `bson:"name" json:"name"`
    Slug        string             `bson:"slug" json:"slug"`
    Description string             `bson:"description" json:"description"`
    Frameworks  []string           `bson:"frameworks" json:"frameworks"`
    Tags        []string           `bson:"tags" json:"tags"`
    License     string             `bson:"license" json:"license"`
    OwnerID     string             `bson:"ownerId" json:"ownerId"`
    RepoLink    RepoLink           `bson:"repoLink" json:"repoLink"`

    // Social & analytics
    LikedBy        []string `bson:"likedBy" json:"likedBy"`
    LikeCount      int      `bson:"likeCount" json:"likeCount"`
    UniqueVisitors []string `bson:"uniqueVisitors" json:"uniqueVisitors"`
    ViewCount      int      `bson:"viewCount" json:"viewCount"`
    AverageRating  float64  `bson:"averageRating" json:"averageRating"`
    RatingCount    int      `bson:"ratingCount" json:"ratingCount"`

    // Visibility / team access
    Visibility    string   `bson:"visibility" json:"visibility"` // "public" | "private"
    Collaborators []string `bson:"collaborators" json:"collaborators"`

    CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
    UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
}

type RepoLink struct {
    Owner         string `bson:"owner" json:"owner"`
    Repo          string `bson:"repo" json:"repo"`
    Path          string `bson:"path" json:"path"`     // folder where component lives
    Ref           string `bson:"ref" json:"ref"`       // branch/tag
    Commit        string `bson:"commit" json:"commit"` // optional pinned sha
    WebhookSecret string `bson:"webhookSecret,omitempty" json:"-"` // never serialized to clients directly
}
```

### Component Version Model

```go
type BuildState string

const (
    VersionBuildNone    BuildState = "none"
    VersionBuildQueued  BuildState = "queued"
    VersionBuildRunning BuildState = "running"
    VersionBuildReady   BuildState = "ready"
    VersionBuildError   BuildState = "error"
)

type ComponentVersion struct {
    ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    ComponentID primitive.ObjectID `bson:"componentId" json:"componentId"`
    Version     string             `bson:"version" json:"version"`
    Changelog   string             `bson:"changelog,omitempty" json:"changelog,omitempty"`
    Readme      string             `bson:"readme,omitempty" json:"readme,omitempty"`
    CodeURL     string             `bson:"codeUrl,omitempty" json:"codeUrl,omitempty"`
    PreviewURL  string             `bson:"previewUrl,omitempty" json:"previewUrl,omitempty"`
    BuildState  BuildState         `bson:"buildState,omitempty" json:"buildState,omitempty"`
    CommitSHA   string             `bson:"commitSha" json:"commitSha"` // unique per component; also the build-cache key
    CreatedBy   string             `bson:"createdBy" json:"createdBy"`
    CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}
```

### Rating Model

```go
type Rating struct {
    ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    ComponentID    primitive.ObjectID `bson:"componentId" json:"componentId"`
    UserID         string             `bson:"userId" json:"userId"` // one rating per (componentId, userId)
    AuthorUsername string             `bson:"authorUsername,omitempty" json:"authorUsername,omitempty"`
    AuthorName     string             `bson:"authorName,omitempty" json:"authorName,omitempty"`
    AuthorAvatar   string             `bson:"authorAvatar,omitempty" json:"authorAvatar,omitempty"`
    Score          int                `bson:"score" json:"score"` // 1-5
    Review         string             `bson:"review" json:"review"`
    CreatedAt      time.Time          `bson:"createdAt" json:"createdAt"`
    UpdatedAt      time.Time          `bson:"updatedAt" json:"updatedAt"`
}
```

### Comment Model

```go
type Comment struct {
    ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    ComponentID    primitive.ObjectID `bson:"componentId" json:"componentId"`
    UserID         string             `bson:"userId" json:"userId"`
    AuthorUsername string             `bson:"authorUsername,omitempty" json:"authorUsername,omitempty"`
    AuthorName     string             `bson:"authorName,omitempty" json:"authorName,omitempty"`
    AuthorAvatar   string             `bson:"authorAvatar,omitempty" json:"authorAvatar,omitempty"`
    Content        string             `bson:"content" json:"content"`
    CreatedAt      time.Time          `bson:"createdAt" json:"createdAt"`
}
```

### User Model

```go
type User struct {
    ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    Name        string             `bson:"name" json:"name"`
    Email       string             `bson:"email" json:"email"`
    Username    string             `bson:"username" json:"username"`
    AvatarURL   string             `bson:"avatarUrl" json:"avatarUrl"`
    Provider    string             `bson:"provider" json:"provider"`
    ProviderID  string             `bson:"providerId" json:"providerId"`
    AccessToken string             `bson:"accessToken,omitempty" json:"-"` // encrypted at rest, never serialized
    CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
    UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}
```

### Build Job Model

```go
type BuildStatus string

const (
    BuildQueued  BuildStatus = "queued"
    BuildRunning BuildStatus = "running"
    BuildSuccess BuildStatus = "success"
    BuildError   BuildStatus = "error"
)

type BuildArtifact struct {
    BundleURL string `bson:"bundleUrl" json:"bundleUrl"` // public URL (S3/MinIO, optionally CDN-fronted)
}

type BuildRepo struct {
    Owner  string `bson:"owner" json:"owner"`
    Repo   string `bson:"repo" json:"repo"`
    Path   string `bson:"path" json:"path"`
    Ref    string `bson:"ref" json:"ref"`
    Commit string `bson:"commit" json:"commit"`
}

type BuildJob struct {
    ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    ComponentID primitive.ObjectID `bson:"componentId" json:"componentId"`
    Component   string             `bson:"component" json:"component"` // slug
    Version     string             `bson:"version" json:"version"`
    Status      BuildStatus        `bson:"status" json:"status"`
    OwnerID     string             `bson:"ownerId" json:"ownerId"`
    Repo        BuildRepo          `bson:"repo" json:"repo"`
    Artifacts   *BuildArtifact     `bson:"artifacts,omitempty" json:"artifacts,omitempty"`
    Logs        []string           `bson:"logs,omitempty" json:"logs,omitempty"`

    Attempts    int `bson:"attempts" json:"attempts"`       // failed attempts so far
    MaxAttempts int `bson:"maxAttempts" json:"maxAttempts"` // give up (status=error) after this many failures

    CreatedAt     time.Time  `bson:"createdAt" json:"createdAt"`
    UpdatedAt     time.Time  `bson:"updatedAt" json:"updatedAt"`
    StartedAt     *time.Time `bson:"startedAt,omitempty" json:"startedAt,omitempty"`
    EndedAt       *time.Time `bson:"endedAt,omitempty" json:"endedAt,omitempty"`
    NextAttemptAt *time.Time `bson:"nextAttemptAt,omitempty" json:"nextAttemptAt,omitempty"` // set when retrying after backoff
}
```

## Implementation Details

1. **API Security**:
   - Write/social/profile routes are secured behind the `JWTProtected` middleware and require a valid JWT in the `Authorization` header.
   - `GET /components/:slug` and `GET /users/:id` use `OptionalAuth` instead — a bearer token is parsed if present but the request is never rejected, so these stay usable anonymously while still revealing the caller's own private components when they're logged in.
   - The GitHub push webhook (`POST /webhooks/github/:slug`) authenticates via an HMAC-SHA256 signature (`X-Hub-Signature-256`) instead of a JWT, since GitHub calls it directly.

2. **Response Format Consistency**:
   - List endpoints always return an empty array (`[]`), never `null`, when no results are found.
   - Nested payloads follow the pattern `{success:true, data:{ <resource>: {...} }}` (e.g. `data.component`, `data.build`) or `{success:true, data:{ <resource>s: [...] }}` for lists.

3. **Caching**: `GET /components` and `GET /components/:slug` are fronted by Redis (`internal/cache`), invalidated on writes (likes, ratings, repo-link, visibility changes). Private components bypass the cache entirely so the per-request authorization check always runs against a fresh document.

4. **Build Workflow**:
   - Enqueuing a build checks `internal/handlers/build_cache.go` first — an identical `commitSha` already built successfully for the component reuses that output instead of running the pipeline again.
   - Otherwise a `build_jobs` document is created with `status: "queued"` and pushed onto a Redis Stream (`builds:stream`) for near-instant worker pickup, with a slower Mongo poll as a fallback sweep.
   - Status transitions: `queued → running → success/error`. A failed job retries with exponential backoff (`10s * 2^attempt`, capped at 2m) up to `maxAttempts` before finally erroring out.
   - On successful build completion, the component version's `buildState` becomes `"ready"` and `previewUrl` is populated.

5. **API Documentation**: Swagger docs are generated from handler annotations and served at `/docs/index.html`; keep this document's examples in sync when route shapes change.
