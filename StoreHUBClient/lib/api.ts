import type {
  ApiResponse,
  Component,
  ComponentsListResponse,
  ComponentDetailResponse,
  ComponentCreateRequest,
  ComponentCreateResponse,
  ComponentLinkRequest,
  ComponentVersion,
  VersionCreateRequest,
  VersionCreateResponse,
  BuildEnqueueResponse,
  BuildStatusResponse,
  BuildJob,
  GitHubRepo,
  GitHubContent,
  GitHubBranch,
  UserProfileResponse,
  ComponentsQueryParams,
  GitHubReposQueryParams,
  GitHubContentsQueryParams,
  GitHubBranchQueryParams,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

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
function buildQueryString(params: Record<string, any>): string {
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
   * Link component to GitHub repository (requires auth)
   */
  async link(slug: string, data: ComponentLinkRequest, authToken: string) {
    const response = await apiFetch<{ component: Component }>(
      `/api/components/${slug}/link`,
      {
        method: "POST",
        body: JSON.stringify(data),
        authToken,
      }
    );
    return response.component;
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
   * Get build status by ID (requires auth)
   */
  async getStatus(buildId: string, authToken: string) {
    const response = await apiFetch<BuildStatusResponse>(
      `/api/builds/${buildId}`,
      { authToken }
    );
    return response.build;
  },

  /**
   * List all builds for a component version (requires auth)
   */
  async list(slug: string, version: string, authToken: string) {
    const response = await apiFetch<{ builds: BuildJob[] }>(
      `/api/components/${slug}/versions/${version}/builds`,
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
   * Get user profile by provider ID (public, no auth required)
   */
  async getProfileById(providerId: string) {
    const response = await apiFetch<UserProfileResponse>(
      `/users/${providerId}`
    );
    return response;
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
