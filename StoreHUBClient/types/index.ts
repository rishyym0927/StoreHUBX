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
  likedByMe?: boolean;
  likeCount?: number;
  viewCount?: number;
  averageRating?: number;
  ratingCount?: number;
  visibility?: "public" | "private";
  collaborators?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  componentId: string;
  userId: string;
  authorUsername?: string;
  authorName?: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
}

export interface Rating {
  id: string;
  componentId: string;
  userId: string;
  authorUsername?: string;
  authorName?: string;
  authorAvatar?: string;
  score: number;
  review: string;
  createdAt: string;
  updatedAt: string;
}

// A version's build status/preview URL is derived from the latest BuildJob
// for its id (see buildApi / useBuilds) — ComponentVersion no longer tracks
// either directly.
export interface ComponentVersion {
  id: string;
  componentId: string;
  version: string;
  changelog?: string;
  readme?: string;
  codeUrl?: string;
  commitSha: string; // Unique commit identifier
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
  versionId?: string;
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
// Collections / Follows / Notifications (Phase 5)
// ========================================

export interface Collection {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  componentIds: string[];
  visibility: "public" | "private";
  createdAt: string;
  updatedAt: string;
}

export type FollowTargetType = "user" | "component";

export interface Follow {
  id: string;
  followerId: string;
  targetType: FollowTargetType;
  targetId: string;
  createdAt: string;
}

export type NotificationType = "new_version" | "comment" | "build_completed";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  componentId?: string;
  message: string;
  read: boolean;
  createdAt: string;
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

// Phase 7 — GitHub data enrichment. Trimmed views returned by the backend's
// cached /api/github/* enrichment endpoints (internal/github/handlers.go).
export interface GitHubRepoInfo {
  stars: number;
  forks: number;
  openIssues: number;
  description: string;
  license: { spdxId: string; name: string } | null;
  topics: string[];
  defaultBranch: string;
}

export type GitHubLanguages = Record<string, number>;

export interface GitHubLatestCommit {
  sha: string;
  message: string;
  authorName: string;
  date: string;
  htmlUrl: string;
}

export interface GitHubContributor {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  contributions: number;
}

export interface GitHubReadme {
  content: string;
}

// Repo autofill — prefill of the new-component form
// from a linked GitHub repo. description/tags may come from an AI (Groq)
// fallback when GitHub's own data is missing/sparse — descriptionSource and
// tagsSource say which ("github" | "ai") so the UI can flag it for review.
// Every field stays editable regardless of source.
export type AutofillSource = "github" | "ai";

export interface GitHubAutofill {
  name: string;
  description: string;
  descriptionSource: AutofillSource;
  license: string;
  tags: string[];
  tagsSource: AutofillSource;
  frameworks: string[];
  readme: string;
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
  tags?: string[];
}

export interface ComponentLinkResponse {
  component: Component;
  initialVersion?: ComponentVersion | null;
  message: string;
}

export interface VersionCreateRequest {
  version: string;
  changelog?: string;
  readme?: string;
  codeUrl?: string;
  commitSha?: string; // Commit SHA for the version
}

export interface AutoDeployRequest {
  commitSha: string;
  version?: string;   // Optional: suggest version number
  changelog?: string; // Optional: changelog message
}

export interface VersionCreateResponse {
  status: string;
  version: ComponentVersion;
  message?: string;
}

export interface BuildEnqueueResponse {
  jobId: string;
  status: string;
}

export interface BuildStatusResponse {
  build: BuildJob;
}

export interface RatingsListResponse {
  ratings: Rating[];
  averageRating: number;
  ratingCount: number;
}

export interface RatingUpsertRequest {
  score: number;
  review?: string;
}

export interface RatingUpsertResponse {
  message: string;
  rating: Rating;
}

export interface ComponentAnalytics {
  id: string;
  slug: string;
  name: string;
  viewCount: number;
  likeCount: number;
  averageRating: number;
  ratingCount: number;
  commentCount: number;
}

export interface OwnerAnalyticsResponse {
  components: ComponentAnalytics[];
  totals: {
    componentCount: number;
    viewCount: number;
    likeCount: number;
    commentCount: number;
  };
}

export interface UserProfileResponse {
  user: User;
  components: Component[];
  stats: {
    totalComponents: number;
  };
  status: string;
}

export interface CollectionCreateRequest {
  name: string;
  description?: string;
  visibility?: "public" | "private";
}

export interface CollectionCreateResponse {
  status: string;
  collection: Collection;
}

export interface CollectionsListResponse {
  collections: Collection[];
}

export interface FollowRequest {
  targetType: FollowTargetType;
  targetId: string;
}

export interface NotificationsListResponse {
  notifications: Notification[];
  unreadCount: number;
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

export interface GitHubRepoQueryParams {
  owner: string;
  repo: string;
}

export interface GitHubLatestCommitQueryParams {
  owner: string;
  repo: string;
  ref?: string;
}

export interface GitHubReadmeQueryParams {
  owner: string;
  repo: string;
  ref?: string;
}

export interface GitHubAutofillQueryParams {
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
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
