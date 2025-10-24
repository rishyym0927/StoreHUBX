// ========================================
// Core Data Models
// ========================================

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  avatarUrl: string;
  provider: string;
  providerId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RepoLink {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  commit?: string;
}

export interface Component {
  id: string;
  name: string;
  slug: string;
  description: string;
  frameworks: string[];
  tags: string[];
  license: string;
  ownerId: string;
  repoLink?: RepoLink | null;
  createdAt: string;
  updatedAt: string;
}

export type BuildState = "none" | "queued" | "running" | "ready" | "error";

export interface ComponentVersion {
  id: string;
  componentId: string;
  version: string;
  changelog?: string;
  readme?: string;
  codeUrl?: string;
  previewUrl?: string;
  buildState?: BuildState;
  createdBy: string;
  createdAt: string;
}

export type BuildStatus = "queued" | "running" | "success" | "error";

export interface BuildRepo {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  commit?: string;
}

export interface BuildArtifact {
  bundleUrl: string;
}

export interface BuildJob {
  id: string;
  componentId: string;
  component: string;
  version: string;
  status: BuildStatus;
  ownerId: string;
  repo: BuildRepo;
  artifacts?: BuildArtifact;
  logs?: string[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
}

// ========================================
// GitHub Integration Models
// ========================================

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description?: string;
  owner: {
    login: string;
    id: number;
  };
  default_branch: string;
}

export interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  url: string;
  html_url: string;
  size?: number;
  download_url?: string;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

// ========================================
// API Request/Response Types
// ========================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  page: number;
  limit: number;
  total: number;
  items: T[];
}

export interface ComponentsListResponse {
  page: number;
  limit: number;
  total: number;
  components: Component[];
}

export interface ComponentDetailResponse {
  component: Component;
}

export interface ComponentCreateRequest {
  name: string;
  description?: string;
  frameworks: string[];
  tags?: string[];
  license?: string;
}

export interface ComponentCreateResponse {
  status: string;
  component: Component;
}

export interface ComponentLinkRequest {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  commit?: string;
}

export interface VersionCreateRequest {
  version: string;
  changelog?: string;
  readme?: string;
  codeUrl?: string;
  previewUrl?: string;
}

export interface VersionCreateResponse {
  status: string;
  version: ComponentVersion;
}

export interface BuildEnqueueResponse {
  jobId: string;
  status: string;
}

export interface BuildStatusResponse {
  build: BuildJob;
}

export interface UserProfileResponse {
  user: User;
  components: Component[];
  stats: {
    totalComponents: number;
  };
  status: string;
}

// ========================================
// Query Parameters
// ========================================

export interface ComponentsQueryParams {
  q?: string;
  framework?: string;
  tags?: string;
  page?: number;
  limit?: number;
}

export interface GitHubReposQueryParams {
  page?: number;
  per_page?: number;
  visibility?: "all" | "public" | "private";
  affiliation?: string;
}

export interface GitHubContentsQueryParams {
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
}

export interface GitHubBranchQueryParams {
  owner: string;
  repo: string;
  branch?: string;
}

// ========================================
// Client-side State Types
// ========================================

export interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clear: () => void;
}

export interface ComponentFilters {
  search: string;
  framework: string;
  tags: string;
}

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}
