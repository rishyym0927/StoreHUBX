# StoreHUBX - Component Repository API

StoreHUBX is a platform for publishing, discovering, and managing reusable UI components. This document provides an overview of all available API endpoints, their request/response formats, and the underlying data models.

## Table of Contents

- [Authentication](#authentication)
- [API Response Format](#api-response-format)
- [API Endpoints](#api-endpoints)
  - [Auth](#auth)
  - [Health](#health)
  - [Components](#components)
  - [Versions](#versions)
  - [GitHub Integration](#github-integration)
  - [Builds](#builds)
  - [User](#user)
- [Data Models](#data-models)
  - [Component Model](#component-model)
  - [Component Version Model](#component-version-model)
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

### Health

#### Check Service Health

- **GET** `/health`
- **Description**: Simple health check endpoint
- **Response**:
  ```json
  {
    "status": "ok"
  }
  ```

### Components

#### Get All Components

- **GET** `/components`
- **Description**: Retrieves a paginated list of components with filtering options
- **Query Parameters**:
  - `q` (optional): Search term for component name, description, or tags
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
      "components": [
        {
          "id": "60d21b4667d0d8992e610c85",
          "name": "Button",
          "slug": "button",
          "description": "A customizable button component",
          "frameworks": ["react", "vue"],
          "tags": ["ui", "form", "input"],
          "license": "MIT",
          "ownerId": "123456789",
          "repoLink": {
            "owner": "username",
            "repo": "components",
            "path": "packages/button",
            "ref": "main",
            "commit": "a1b2c3d4e5f6"
          },
          "createdAt": "2023-06-20T12:00:00Z",
          "updatedAt": "2023-06-21T14:30:00Z"
        }
        // More components...
      ]
    }
  }
  ```

#### Get Component by Slug

- **GET** `/components/:slug`
- **Description**: Retrieves detailed information about a specific component
- **URL Parameters**:
  - `slug`: The unique slug identifier for the component
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "component": {
        "id": "60d21b4667d0d8992e610c85",
        "name": "Button",
        "slug": "button",
        "description": "A customizable button component",
        "frameworks": ["react", "vue"],
        "tags": ["ui", "form", "input"],
        "license": "MIT",
        "ownerId": "123456789",
        "repoLink": {
          "owner": "username",
          "repo": "components",
          "path": "packages/button",
          "ref": "main",
          "commit": "a1b2c3d4e5f6"
        },
        "createdAt": "2023-06-20T12:00:00Z",
        "updatedAt": "2023-06-21T14:30:00Z"
      }
    }
  }
  ```

#### Create Component

- **POST** `/api/components` (Protected)
- **Description**: Creates a new component
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
  {
    "success": true,
    "data": {
      "status": "created",
      "component": {
        "id": "60d21b4667d0d8992e610c85",
        "name": "Button",
        "slug": "button",
        "description": "A customizable button component",
        "frameworks": ["react", "vue"],
        "tags": ["ui", "form", "input"],
        "license": "MIT",
        "ownerId": "123456789",
        "createdAt": "2023-06-20T12:00:00Z",
        "updatedAt": "2023-06-20T12:00:00Z"
      }
    }
  }
  ```

#### Link Component to GitHub Repository

- **POST** `/api/components/:slug/link` (Protected)
- **Description**: Links a component to a GitHub repository
- **URL Parameters**:
  - `slug`: The unique slug identifier for the component
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
      "component": {
        "id": "60d21b4667d0d8992e610c85",
        "name": "Button",
        "slug": "button",
        "description": "A customizable button component",
        "frameworks": ["react", "vue"],
        "tags": ["ui", "form", "input"],
        "license": "MIT",
        "ownerId": "123456789",
        "repoLink": {
          "owner": "username",
          "repo": "components",
          "path": "packages/button",
          "ref": "main",
          "commit": "a1b2c3d4e5f6"
        },
        "createdAt": "2023-06-20T12:00:00Z",
        "updatedAt": "2023-06-21T14:30:00Z"
      }
    }
  }
  ```

### Versions

#### Get Component Versions

- **GET** `/components/:slug/versions`
- **Description**: Retrieves all versions for a specific component
- **URL Parameters**:
  - `slug`: The unique slug identifier for the component
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "versions": [
        {
          "id": "60d21b4667d0d8992e610c86",
          "componentId": "60d21b4667d0d8992e610c85",
          "version": "1.0.0",
          "changelog": "Initial release",
          "readme": "# Button\n\nA customizable button component...",
          "codeUrl": "https://github.com/username/components/tree/main/packages/button",
          "previewUrl": "https://example.com/preview/button/1.0.0",
          "buildState": "ready",
          "createdBy": "123456789",
          "createdAt": "2023-06-20T12:30:00Z"
        },
        {
          "id": "60d21b4667d0d8992e610c87",
          "componentId": "60d21b4667d0d8992e610c85",
          "version": "1.1.0",
          "changelog": "Added size variants",
          "readme": "# Button\n\nA customizable button component with size variants...",
          "codeUrl": "https://github.com/username/components/tree/main/packages/button",
          "previewUrl": "https://example.com/preview/button/1.1.0",
          "buildState": "ready",
          "createdBy": "123456789",
          "createdAt": "2023-06-22T10:15:00Z"
        }
      ]
    }
  }
  ```

#### Add Component Version

- **POST** `/api/components/:slug/versions` (Protected)
- **Description**: Adds a new version to an existing component
- **URL Parameters**:
  - `slug`: The unique slug identifier for the component
- **Request Body**:
  ```json
  {
    "version": "1.1.0",
    "changelog": "Added size variants",
    "readme": "# Button\n\nA customizable button component with size variants...",
    "codeUrl": "https://github.com/username/components/tree/main/packages/button"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "status": "version added",
      "version": {
        "id": "60d21b4667d0d8992e610c87",
        "componentId": "60d21b4667d0d8992e610c85",
        "version": "1.1.0",
        "changelog": "Added size variants",
        "readme": "# Button\n\nA customizable button component with size variants...",
        "codeUrl": "https://github.com/username/components/tree/main/packages/button",
        "createdBy": "123456789",
        "createdAt": "2023-06-22T10:15:00Z"
      }
    }
  }
  ```

### GitHub Integration

#### List User's GitHub Repositories

- **GET** `/api/github/repos` (Protected)
- **Description**: Lists repositories accessible to the authenticated user
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
        "owner": {
          "login": "username",
          "id": 12345
        },
        "default_branch": "main"
      }
      // More repositories...
    ]
  }
  ```

#### Get Repository Contents

- **GET** `/api/github/contents` (Protected)
- **Description**: Retrieves files and directories in a repository path
- **Query Parameters**:
  - `owner` (required): Repository owner
  - `repo` (required): Repository name
  - `path` (optional): Path within the repository (default: root)
  - `ref` (optional): Branch, tag, or commit SHA
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "name": "button",
        "path": "packages/button",
        "sha": "a1b2c3d4e5f6",
        "type": "dir",
        "url": "https://api.github.com/repos/username/components/contents/packages/button",
        "html_url": "https://github.com/username/components/tree/main/packages/button"
      },
      {
        "name": "README.md",
        "path": "packages/README.md",
        "sha": "b2c3d4e5f6a1",
        "type": "file",
        "url": "https://api.github.com/repos/username/components/contents/packages/README.md",
        "html_url": "https://github.com/username/components/blob/main/packages/README.md"
      }
      // More files and directories...
    ]
  }
  ```

#### Get Branch Information

- **GET** `/api/github/branches` (Protected)
- **Description**: Retrieves information about a specific branch
- **Query Parameters**:
  - `owner` (required): Repository owner
  - `repo` (required): Repository name
  - `branch` (optional): Branch name (default: main)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "name": "main",
      "commit": {
        "sha": "a1b2c3d4e5f6",
        "url": "https://api.github.com/repos/username/components/commits/a1b2c3d4e5f6"
      },
      "protected": false
    }
  }
  ```

### Builds

#### Enqueue Component Build

- **POST** `/api/components/:slug/versions/:version/build` (Protected)
- **Description**: Enqueues a build job for a specific component version
- **URL Parameters**:
  - `slug`: The unique slug identifier for the component
  - `version`: The version string (e.g., "1.0.0")
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "jobId": "60d21b4667d0d8992e610c88",
      "status": "queued"
    }
  }
  ```

#### Get Build Status

- **GET** `/api/builds/:id` (Protected)
- **Description**: Retrieves details about a specific build job
- **URL Parameters**:
  - `id`: The build job ID
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
        "repo": {
          "owner": "username",
          "repo": "components",
          "path": "packages/button",
          "ref": "main",
          "commit": "a1b2c3d4e5f6"
        },
        "artifacts": {
          "bundleUrl": "https://storage.example.com/components/button/1.0.0/bundle.js"
        },
        "logs": [
          "enqueued",
          "cloning repository",
          "installing dependencies",
          "building component",
          "uploading artifacts",
          "build completed successfully"
        ],
        "createdAt": "2023-06-22T11:00:00Z",
        "updatedAt": "2023-06-22T11:05:30Z",
        "startedAt": "2023-06-22T11:00:10Z",
        "endedAt": "2023-06-22T11:05:30Z"
      }
    }
  }
  ```

#### List Builds for Version

- **GET** `/api/components/:slug/versions/:version/builds` (Protected)
- **Description**: Lists all build jobs for a specific component version
- **URL Parameters**:
  - `slug`: The unique slug identifier for the component
  - `version`: The version string (e.g., "1.0.0")
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "builds": [
        {
          "id": "60d21b4667d0d8992e610c88",
          "componentId": "60d21b4667d0d8992e610c85",
          "component": "button",
          "version": "1.0.0",
          "status": "success",
          "ownerId": "123456789",
          "repo": {
            "owner": "username",
            "repo": "components",
            "path": "packages/button",
            "ref": "main",
            "commit": "a1b2c3d4e5f6"
          },
          "artifacts": {
            "bundleUrl": "https://storage.example.com/components/button/1.0.0/bundle.js"
          },
          "logs": [
            "enqueued",
            "cloning repository",
            "installing dependencies",
            "building component",
            "uploading artifacts",
            "build completed successfully"
          ],
          "createdAt": "2023-06-22T11:00:00Z",
          "updatedAt": "2023-06-22T11:05:30Z",
          "startedAt": "2023-06-22T11:00:10Z",
          "endedAt": "2023-06-22T11:05:30Z"
        }
        // More builds...
      ]
    }
  }
  ```

### User

#### Get User Profile

- **GET** `/api/me` (Protected)
- **Description**: Retrieves the profile of the authenticated user
- **Response**:
  ```json
  {
    "user_id": "123456789",
    "email": "user@example.com",
    "status": "authenticated"
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
    CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
    UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type RepoLink struct {
    Owner  string `bson:"owner" json:"owner"`
    Repo   string `bson:"repo" json:"repo"`
    Path   string `bson:"path" json:"path"`     // folder where component lives
    Ref    string `bson:"ref" json:"ref"`       // branch/tag
    Commit string `bson:"commit" json:"commit"` // optional pinned sha
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
    CreatedBy   string             `bson:"createdBy" json:"createdBy"`
    CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
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
    AccessToken string             `bson:"accessToken,omitempty" json:"-"`
    CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
    UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}
```

### Build Job Model

```go
type BuildStatus string

const (
    BuildQueued   BuildStatus = "queued"
    BuildRunning  BuildStatus = "running"
    BuildSuccess  BuildStatus = "success"
    BuildError    BuildStatus = "error"
)

type BuildArtifact struct {
    BundleURL string `bson:"bundleUrl" json:"bundleUrl"` // public URL (S3/R2/MinIO)
}

type BuildRepo struct {
    Owner  string `bson:"owner" json:"owner"`
    Repo   string `bson:"repo" json:"repo"`
    Path   string `bson:"path" json:"path"`
    Ref    string `bson:"ref" json:"ref"`
    Commit string `bson:"commit" json:"commit"` // optional pinned sha
}

type BuildJob struct {
    ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    ComponentID primitive.ObjectID `bson:"componentId" json:"componentId"`
    Component   string             `bson:"component" json:"component"`   // slug (for convenience)
    Version     string             `bson:"version" json:"version"`       // e.g., "0.1.0"
    Status      BuildStatus        `bson:"status" json:"status"`         // queued|running|success|error
    OwnerID     string             `bson:"ownerId" json:"ownerId"`       // from JWT (providerId)
    Repo        BuildRepo          `bson:"repo" json:"repo"`
    Artifacts   *BuildArtifact     `bson:"artifacts,omitempty" json:"artifacts,omitempty"`
    Logs        []string           `bson:"logs,omitempty" json:"logs,omitempty"`
    CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
    UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
    StartedAt   *time.Time         `bson:"startedAt,omitempty" json:"startedAt,omitempty"`
    EndedAt     *time.Time         `bson:"endedAt,omitempty" json:"endedAt,omitempty"`
}
```

## Implementation Details

This section highlights key implementation behaviors in the StoreHUBX API:

1. **API Security**:
   - All protected routes are secured behind the `JWTProtected` middleware
   - Authenticated endpoints require a valid JWT token in the Authorization header

2. **Response Format Consistency**:
   - `/components` endpoint always returns `{success:true, data:{ components, page, limit, total }}` format
   - Even when no components are found, the API returns `components: []` (empty array) rather than null
   - `/components/:slug` returns `{success:true, data:{ component }}` (wrapped in a data object)

3. **Component GitHub Integration**:
   - `/api/components/:slug/link` writes to the component's `repoLink` property
   - Links components to specific repositories, paths, branches, and commits

4. **Build Workflow**:
   - Enqueuing a build creates a document in the `build_jobs` collection with status: "queued"
   - Worker process logs heartbeat status (queued=n) and claims pending jobs
   - Build status transitions follow: queued → running → success/error
   - On successful build completion, the component version's `buildState` is updated to "ready"
   - After successful builds, the `previewUrl` property is populated with a link to the component preview

5. **API Documentation**:
   - Swagger documentation is maintained and matches this document
   - All endpoints, parameters, and response formats are consistently documented
