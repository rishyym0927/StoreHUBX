import type {
  Component,
  ComponentsListResponse,
  ComponentDetailResponse,
  ComponentCreateRequest,
  ComponentCreateResponse,
  ComponentLinkRequest,
  ComponentLinkResponse,
  ComponentVersion,
  VersionCreateRequest,
  VersionCreateResponse,
  Comment,
  RatingsListResponse,
  RatingUpsertRequest,
  RatingUpsertResponse,
  AutoDeployRequest,
  BuildEnqueueResponse,
  BuildStatusResponse,
  BuildJob,
  GitHubRepo,
  GitHubContent,
  GitHubBranch,
  GitHubRepoInfo,
  GitHubLanguages,
  GitHubLatestCommit,
  GitHubContributor,
  GitHubReadme,
  GitHubAutofill,
  GitHubAutofillQueryParams,
  UserProfileResponse,
  OwnerAnalyticsResponse,
  FollowRequest,
  NotificationsListResponse,
  CollectionCreateRequest,
  CollectionCreateResponse,
  CollectionUpdateRequest,
  CollectionsListResponse,
  CollectionDetailResponse,
  CollectionMutationResponse,
  ComponentsQueryParams,
  GitHubReposQueryParams,
  GitHubContentsQueryParams,
  GitHubBranchQueryParams,
  GitHubRepoQueryParams,
  GitHubLatestCommitQueryParams,
  GitHubReadmeQueryParams,
} from "@/types";
import { onUnauthorized } from "@/lib/auth-events";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

if (!process.env.NEXT_PUBLIC_API_BASE) {
  console.error(
    "NEXT_PUBLIC_API_BASE is not set — API calls and GitHub login links will be broken. Set it in .env.local."
  );
}

export const GITHUB_LOGIN_URL = `${API_BASE}/auth/github/login`;

// ========================================
// Core API Helper
// ========================================

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface FetchOptions extends RequestInit {
  authToken?: string;
}

/**
 * Low-level fetch wrapper with automatic error handling and response normalization
 */
async function apiFetch<T>(path: string, options?: FetchOptions): Promise<T> {
  const { authToken, headers: customHeaders, ...init } = options || {};

  const headers = new Headers(customHeaders);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });

    // Handle non-OK responses
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      let errorMessage = errorText || `HTTP ${res.status}: ${res.statusText}`;

      // Try to parse error JSON
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
          errorMessage = errorJson.error;
        } else if (errorJson.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // Use raw text
      }

      // A 401 on a request we *did* authenticate means the stored JWT is
      // expired or was signed with a since-rotated secret. Drop it centrally
      // so the app stops replaying a dead token on every page.
      if (res.status === 401 && authToken) {
        onUnauthorized();
      }

      throw new ApiError(res.status, res.statusText, errorMessage);
    }

    // Handle empty responses
    const text = await res.text();
    if (!text) {
      return {} as T;
    }

    const json = JSON.parse(text);

    // Normalize response structure
    // Handle {success: true, data: {...}} format
    if (json?.success && json?.data !== undefined) {
      return json.data as T;
    }

    // Handle direct data
    return json as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new Error(
      error instanceof Error ? error.message : "Network request failed"
    );
  }
}

/**
 * Build query string from params object
 */
function buildQueryString(params: object): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

// ========================================
// Component API
// ========================================

export const componentApi = {
  /**
   * Get all components with optional filtering and pagination
   */
  async list(params?: ComponentsQueryParams, authToken?: string) {
    const query = buildQueryString(params || {});
    const response = await apiFetch<ComponentsListResponse>(
      `/components${query}`,
      { authToken }
    );
    return response;
  },

  /**
   * Get component details by slug
   */
  async get(slug: string, authToken?: string) {
    const response = await apiFetch<ComponentDetailResponse>(
      `/components/${slug}`,
      { authToken }
    );
    return response.component;
  },

  /**
   * Create a new component (requires auth)
   */
  async create(data: ComponentCreateRequest, authToken: string) {
    const response = await apiFetch<ComponentCreateResponse>(
      "/api/components",
      {
        method: "POST",
        body: JSON.stringify(data),
        authToken,
      }
    );
    return response;
  },

  /**
   * Permanently delete a component (owner-only). Cascades server-side to its
   * versions, build jobs, likes/ratings/comments, notifications, and removes
   * it from any collections.
   */
  async delete(slug: string, authToken: string) {
    const response = await apiFetch<{ message: string }>(
      `/api/components/${slug}`,
      {
        method: "DELETE",
        authToken,
      }
    );
    return response;
  },

  /**
   * Link component to GitHub repository (requires auth)
   */
  async link(slug: string, data: ComponentLinkRequest, authToken: string) {
    const response = await apiFetch<ComponentLinkResponse>(
      `/api/components/${slug}/link`,
      {
        method: "POST",
        body: JSON.stringify(data),
        authToken,
      }
    );
    return response;
  },
  /**
   * Toggle like on a component (requires auth)
   */
  async toggleLike(slug: string, authToken: string) {
    const response = await apiFetch<{ message: string; component: Component }>(
      `/api/components/${slug}/like`,
      {
        method: "POST",
        authToken,
      }
    );
    return response;
  },

  /**
   * Update a component's visibility (public/private), owner-only
   */
  async updateVisibility(slug: string, visibility: "public" | "private", authToken: string) {
    const response = await apiFetch<{ message: string; visibility: string }>(
      `/api/components/${slug}/visibility`,
      {
        method: "PATCH",
        body: JSON.stringify({ visibility }),
        authToken,
      }
    );
    return response;
  },

  /**
   * Add a collaborator (by providerId), owner-only
   */
  async addCollaborator(slug: string, userId: string, authToken: string) {
    const response = await apiFetch<{ message: string; component: Component }>(
      `/api/components/${slug}/collaborators`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
        authToken,
      }
    );
    return response.component;
  },

  /**
   * Remove a collaborator, owner-only
   */
  async removeCollaborator(slug: string, userId: string, authToken: string) {
    const response = await apiFetch<{ message: string; component: Component }>(
      `/api/components/${slug}/collaborators/${userId}`,
      {
        method: "DELETE",
        authToken,
      }
    );
    return response.component;
  },
};

// ========================================
// Comment API
// ========================================

export const commentApi = {
  /**
   * List all comments for a component
   */
  async list(slug: string) {
    const response = await apiFetch<{ comments: Comment[] }>(
      `/components/${slug}/comments`
    );
    return response.comments;
  },

  /**
   * Add a comment to a component (requires auth)
   */
  async create(slug: string, content: string, authToken: string) {
    const response = await apiFetch<{ message: string; comment: Comment }>(
      `/api/components/${slug}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
        authToken,
      }
    );
    return response.comment;
  },

  /**
   * Delete a comment (requires auth)
   */
  async delete(slug: string, commentId: string, authToken: string) {
    const response = await apiFetch<{ message: string }>(
      `/api/components/${slug}/comments/${commentId}`,
      {
        method: "DELETE",
        authToken,
      }
    );
    return response;
  },
};

// ========================================
// Rating API
// ========================================

export const ratingApi = {
  /**
   * List all ratings for a component
   */
  async list(slug: string) {
    const response = await apiFetch<RatingsListResponse>(
      `/components/${slug}/ratings`
    );
    return response;
  },

  /**
   * Upsert the caller's rating on a component (requires auth)
   */
  async upsert(slug: string, data: RatingUpsertRequest, authToken: string) {
    const response = await apiFetch<RatingUpsertResponse>(
      `/api/components/${slug}/ratings`,
      {
        method: "POST",
        body: JSON.stringify(data),
        authToken,
      }
    );
    return response.rating;
  },

  /**
   * Delete the caller's own rating (requires auth)
   */
  async delete(slug: string, authToken: string) {
    const response = await apiFetch<{ message: string }>(
      `/api/components/${slug}/ratings`,
      {
        method: "DELETE",
        authToken,
      }
    );
    return response;
  },
};

// ========================================
// Webhook API
// ========================================

export const webhookApi = {
  /**
   * Get the webhook URL + secret for a component's linked repo (owner-only)
   */
  async getConfig(slug: string, authToken: string) {
    const response = await apiFetch<{ webhookUrl: string; webhookSecret: string }>(
      `/api/components/${slug}/webhook`,
      { authToken }
    );
    return response;
  },
};

// ========================================
// Version API
// ========================================

export const versionApi = {
  /**
   * Get all versions for a component
   */
  async list(slug: string, authToken?: string) {
    const response = await apiFetch<{ versions: ComponentVersion[] }>(
      `/components/${slug}/versions`,
      { authToken }
    );
    return response.versions;
  },

  /**
   * Create a new version for a component (requires auth)
   */
  async create(
    slug: string,
    data: VersionCreateRequest,
    authToken: string
  ) {
    const response = await apiFetch<VersionCreateResponse>(
      `/api/components/${slug}/versions`,
      {
        method: "POST",
        body: JSON.stringify(data),
        authToken,
      }
    );
    return response;
  },

  /**
   * Auto-deploy a new commit (requires auth)
   */
  async autoDeploy(slug: string, data: AutoDeployRequest, authToken: string) {
    const response = await apiFetch<{
      version: ComponentVersion;
      jobId: string;
      message: string;
    }>(
      `/api/components/${slug}/deploy`,
      {
        method: "POST",
        body: JSON.stringify(data),
        authToken,
      }
    );
    return response;
  },
};

// ========================================
// Build API
// ========================================

export const buildApi = {
  /**
   * Enqueue a build for a specific component version (requires auth)
   */
  async enqueue(slug: string, version: string, authToken: string) {
    const response = await apiFetch<BuildEnqueueResponse>(
      `/api/components/${slug}/versions/${version}/build`,
      {
        method: "POST",
        authToken,
      }
    );
    return response;
  },

  /**
   * Get build status by ID (public read)
   */
  async getStatus(buildId: string, authToken?: string) {
    const response = await apiFetch<BuildStatusResponse>(
      `/builds/${buildId}`,
      { authToken }
    );
    return response.build;
  },

  /**
   * List all builds for a component version (public read)
   */
  async list(slug: string, version: string, authToken?: string) {
    const response = await apiFetch<{ builds: BuildJob[] }>(
      `/components/${slug}/versions/${version}/builds`,
      { authToken }
    );
    return response.builds;
  },
};

// ========================================
// GitHub API
// ========================================

export const githubApi = {
  /**
   * List user's GitHub repositories (requires auth)
   */
  async listRepos(params?: GitHubReposQueryParams, authToken?: string) {
    const query = buildQueryString(params || {});
    const response = await apiFetch<GitHubRepo[]>(
      `/api/github/repos${query}`,
      { authToken }
    );
    return response;
  },

  /**
   * Get repository contents (requires auth)
   */
  async getContents(params: GitHubContentsQueryParams, authToken: string) {
    const query = buildQueryString(params);
    const response = await apiFetch<GitHubContent[]>(
      `/api/github/contents${query}`,
      { authToken }
    );
    return response;
  },

  /**
   * Get branch information (requires auth)
   */
  async getBranch(params: GitHubBranchQueryParams, authToken: string) {
    const query = buildQueryString(params);
    const response = await apiFetch<GitHubBranch>(
      `/api/github/branches${query}`,
      { authToken }
    );
    return response;
  },

  /**
   * List all branches for a repository (requires auth)
   */
  async listBranches(owner: string, repo: string, authToken: string) {
    const query = buildQueryString({ owner, repo });
    const response = await apiFetch<GitHubBranch[]>(
      `/api/github/branches${query}`,
      { authToken }
    );
    return response;
  },

  /**
   * Repo stats, description, license, topics. Public — no auth needed, cached server-side.
   */
  async getRepoInfo(params: GitHubRepoQueryParams) {
    const query = buildQueryString(params);
    return apiFetch<GitHubRepoInfo>(`/github/repo-info${query}`);
  },

  /**
   * Bytes-per-language breakdown. Public — no auth needed, cached server-side.
   */
  async getLanguages(params: GitHubRepoQueryParams) {
    const query = buildQueryString(params);
    return apiFetch<GitHubLanguages>(`/github/languages${query}`);
  },

  /**
   * Latest commit message/author/date. Public — no auth needed, cached server-side.
   */
  async getLatestCommit(params: GitHubLatestCommitQueryParams) {
    const query = buildQueryString(params);
    return apiFetch<GitHubLatestCommit>(`/github/latest-commit${query}`);
  },

  /**
   * Top contributors, capped at 12. Public — no auth needed, cached server-side.
   */
  async getContributors(params: GitHubRepoQueryParams) {
    const query = buildQueryString(params);
    return apiFetch<GitHubContributor[]>(`/github/contributors${query}`);
  },

  /**
   * Decoded README markdown content. Public — no auth needed, cached server-side.
   */
  async getReadme(params: GitHubReadmeQueryParams) {
    const query = buildQueryString(params);
    return apiFetch<GitHubReadme>(`/github/readme${query}`);
  },

  /**
   * Prefill new-component form fields (description/license/tags/frameworks)
   * from a repo (requires auth). description/tags may come from an AI
   * fallback when GitHub's own data is missing/sparse — see
   * GitHubAutofill's descriptionSource/tagsSource.
   */
  async getAutofill(params: GitHubAutofillQueryParams, authToken: string) {
    const query = buildQueryString(params);
    return apiFetch<GitHubAutofill>(`/api/github/autofill${query}`, { authToken });
  },
};

// ========================================
// Preview API
// ========================================

export const previewApi = {
  /**
   * Get redirect URL for component version preview
   * This endpoint redirects to the actual preview URL
   */
  getPreviewUrl(slug: string, version: string): string {
    return `${API_BASE}/preview/${slug}/${version}`;
  },
};

// ========================================
// User API
// ========================================

export const userApi = {
  /**
   * Get current user profile with components (requires auth)
   */
  async getProfile(authToken: string) {
    const response = await apiFetch<UserProfileResponse>("/api/me", {
      authToken,
    });
    return response;
  },

  /**
   * Get usage analytics (views/likes/ratings/comments) for the caller's own components
   */
  async getAnalytics(authToken: string) {
    const response = await apiFetch<OwnerAnalyticsResponse>("/api/me/analytics", {
      authToken,
    });
    return response;
  },

  /**
   * Get user profile by provider ID (public, no auth required)
   */
  async getProfileById(providerId: string, authToken?: string) {
    const response = await apiFetch<UserProfileResponse>(
      `/users/${providerId}`,
      { authToken }
    );
    return response;
  },
};

// ========================================
// Follow API (Phase 5)
// ========================================

/**
 * Note: a component's follow target id is the component's **id**, not its
 * slug — the backend fans notifications out on `targetId: <ObjectID hex>`.
 */
export const followApi = {
  /**
   * Follow a user or component (requires auth). Idempotent server-side.
   */
  async follow(target: FollowRequest, authToken: string) {
    const response = await apiFetch<{ message: string }>("/api/follows", {
      method: "POST",
      body: JSON.stringify(target),
      authToken,
    });
    return response;
  },

  /**
   * Unfollow a user or component (requires auth)
   */
  async unfollow(target: FollowRequest, authToken: string) {
    const response = await apiFetch<{ message: string }>("/api/follows", {
      method: "DELETE",
      body: JSON.stringify(target),
      authToken,
    });
    return response;
  },
};

// ========================================
// Notification API (Phase 5)
// ========================================

export const notificationApi = {
  /**
   * List the caller's notifications (newest first, capped at 50) + unread count
   */
  async list(authToken: string) {
    const response = await apiFetch<NotificationsListResponse>(
      "/api/notifications",
      { authToken }
    );
    return response;
  },

  /**
   * Mark a single notification as read
   */
  async markRead(id: string, authToken: string) {
    const response = await apiFetch<{ message: string }>(
      `/api/notifications/${id}/read`,
      { method: "POST", authToken }
    );
    return response;
  },

  /**
   * Mark every unread notification as read
   */
  async markAllRead(authToken: string) {
    const response = await apiFetch<{ message: string }>(
      "/api/notifications/read-all",
      { method: "POST", authToken }
    );
    return response;
  },
};

// ========================================
// Collection API (Phase 5)
// ========================================

export const collectionApi = {
  /**
   * Create a collection (requires auth)
   */
  async create(data: CollectionCreateRequest, authToken: string) {
    const response = await apiFetch<CollectionCreateResponse>("/api/collections", {
      method: "POST",
      body: JSON.stringify(data),
      authToken,
    });
    return response.collection;
  },

  /**
   * List a user's collections. Public; pass a token so the owner also sees
   * their own private ones.
   */
  async listForUser(providerId: string, authToken?: string) {
    const response = await apiFetch<CollectionsListResponse>(
      `/users/${providerId}/collections`,
      { authToken }
    );
    return response.collections;
  },

  /**
   * Get one collection with its components resolved (public)
   */
  async get(id: string, authToken?: string) {
    const response = await apiFetch<CollectionDetailResponse>(
      `/collections/${id}`,
      { authToken }
    );
    return response;
  },

  /**
   * Rename a collection / change its description or visibility (owner-only)
   */
  async update(id: string, data: CollectionUpdateRequest, authToken: string) {
    const response = await apiFetch<CollectionMutationResponse>(
      `/api/collections/${id}`,
      { method: "PATCH", body: JSON.stringify(data), authToken }
    );
    return response.collection;
  },

  /**
   * Delete a collection (owner-only). The components it grouped are untouched.
   */
  async remove(id: string, authToken: string) {
    const response = await apiFetch<{ message: string }>(
      `/api/collections/${id}`,
      { method: "DELETE", authToken }
    );
    return response;
  },

  /**
   * Add a component to a collection (owner-only)
   */
  async addComponent(id: string, componentId: string, authToken: string) {
    const response = await apiFetch<CollectionMutationResponse>(
      `/api/collections/${id}/components/${componentId}`,
      { method: "POST", authToken }
    );
    return response.collection;
  },

  /**
   * Remove a component from a collection (owner-only)
   */
  async removeComponent(id: string, componentId: string, authToken: string) {
    const response = await apiFetch<CollectionMutationResponse>(
      `/api/collections/${id}/components/${componentId}`,
      { method: "DELETE", authToken }
    );
    return response.collection;
  },
};

// ========================================
// Legacy API function (for backward compatibility)
// ========================================

/**
 * @deprecated Use specific API modules instead (componentApi, versionApi, etc.)
 */
export async function api<T>(
  path: string,
  init?: RequestInit & { authToken?: string }
): Promise<T> {
  return apiFetch<T>(path, init);
}
