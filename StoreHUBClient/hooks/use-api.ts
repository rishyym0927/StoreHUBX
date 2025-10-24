"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/store";
import {
  componentApi,
  versionApi,
  buildApi,
  githubApi,
  userApi,
  ApiError,
} from "@/lib/api";
import type {
  Component,
  ComponentVersion,
  BuildJob,
  GitHubRepo,
  ComponentsQueryParams,
} from "@/types";

// ========================================
// Generic Hook Types
// ========================================

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiReturn<T> extends UseApiState<T> {
  refetch: () => Promise<void>;
}

// ========================================
// Component Hooks
// ========================================

/**
 * Hook to fetch paginated components list with filters
 */
export function useComponents(params?: ComponentsQueryParams) {
  const token = useAuth((s) => s.token);
  const [state, setState] = useState<UseApiState<{
    components: Component[];
    page: number;
    limit: number;
    total: number;
  }>>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchComponents = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await componentApi.list(params, token || undefined);
      setState({ data: response, loading: false, error: null });
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch components";
      setState({ data: null, loading: false, error: errorMessage });
    }
  }, [params, token]);

  useEffect(() => {
    fetchComponents();
  }, [fetchComponents]);

  return {
    ...state,
    refetch: fetchComponents,
  };
}

/**
 * Hook to fetch a single component by slug
 */
export function useComponent(slug: string): UseApiReturn<Component> {
  const token = useAuth((s) => s.token);
  const [state, setState] = useState<UseApiState<Component>>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchComponent = useCallback(async () => {
    if (!slug) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const component = await componentApi.get(slug, token || undefined);
      setState({ data: component, loading: false, error: null });
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch component";
      setState({ data: null, loading: false, error: errorMessage });
    }
  }, [slug, token]);

  useEffect(() => {
    fetchComponent();
  }, [fetchComponent]);

  return {
    ...state,
    refetch: fetchComponent,
  };
}

// ========================================
// Version Hooks
// ========================================

/**
 * Hook to fetch component versions
 */
export function useVersions(slug: string): UseApiReturn<ComponentVersion[]> {
  const token = useAuth((s) => s.token);
  const [state, setState] = useState<UseApiState<ComponentVersion[]>>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchVersions = useCallback(async () => {
    if (!slug) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const versions = await versionApi.list(slug, token || undefined);
      setState({ data: versions, loading: false, error: null });
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch versions";
      setState({ data: null, loading: false, error: errorMessage });
    }
  }, [slug, token]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  return {
    ...state,
    refetch: fetchVersions,
  };
}

// ========================================
// Build Hooks
// ========================================

/**
 * Hook to fetch build status with auto-refresh for pending builds
 */
export function useBuildStatus(
  buildId: string | null,
  autoRefresh = true
): UseApiReturn<BuildJob> {
  const token = useAuth((s) => s.token);
  const [state, setState] = useState<UseApiState<BuildJob>>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchBuild = useCallback(async () => {
    if (!buildId || !token) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const build = await buildApi.getStatus(buildId, token);
      setState({ data: build, loading: false, error: null });
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch build status";
      setState({ data: null, loading: false, error: errorMessage });
    }
  }, [buildId, token]);

  useEffect(() => {
    if (!buildId || !token) return;
    
    fetchBuild();

    // Auto-refresh for pending builds
    if (autoRefresh) {
      const interval = setInterval(async () => {
        // Only fetch if we need to check status
        if (buildId && token) {
          try {
            const build = await buildApi.getStatus(buildId, token);
            setState({ data: build, loading: false, error: null });
            
            // Stop polling if build is complete
            if (build.status === "success" || build.status === "error") {
              clearInterval(interval);
            }
          } catch (err) {
            const errorMessage =
              err instanceof ApiError
                ? err.message
                : err instanceof Error
                ? err.message
                : "Failed to fetch build status";
            setState({ data: null, loading: false, error: errorMessage });
          }
        }
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [buildId, token, autoRefresh]); // Remove fetchBuild and state.data from dependencies

  return {
    ...state,
    refetch: fetchBuild,
  };
}

/**
 * Hook to fetch builds for a component version
 */
export function useBuilds(
  slug: string,
  version: string
): UseApiReturn<BuildJob[]> {
  const token = useAuth((s) => s.token);
  const [state, setState] = useState<UseApiState<BuildJob[]>>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchBuilds = useCallback(async () => {
    if (!slug || !version || !token) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const builds = await buildApi.list(slug, version, token);
      setState({ data: builds, loading: false, error: null });
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch builds";
      setState({ data: null, loading: false, error: errorMessage });
    }
  }, [slug, version, token]);

  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  return {
    ...state,
    refetch: fetchBuilds,
  };
}

// ========================================
// GitHub Hooks
// ========================================

/**
 * Hook to fetch user's GitHub repositories
 */
export function useGitHubRepos(): UseApiReturn<GitHubRepo[]> {
  const token = useAuth((s) => s.token);
  const [state, setState] = useState<UseApiState<GitHubRepo[]>>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchRepos = useCallback(async () => {
    if (!token) {
      setState({ data: null, loading: false, error: "Not authenticated" });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const repos = await githubApi.listRepos(
        { page: 1, per_page: 100, affiliation: "owner,collaborator" },
        token
      );
      setState({ data: repos, loading: false, error: null });
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch repositories";
      setState({ data: null, loading: false, error: errorMessage });
    }
  }, [token]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  return {
    ...state,
    refetch: fetchRepos,
  };
}

/**
 * Hook to fetch branches for a GitHub repository
 */
export function useGitHubBranches(
  owner: string,
  repo: string
): UseApiReturn<import("@/types").GitHubBranch[]> {
  const token = useAuth((s) => s.token);
  const [state, setState] = useState<UseApiState<import("@/types").GitHubBranch[]>>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchBranches = useCallback(async () => {
    if (!token || !owner || !repo) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const branches = await githubApi.listBranches(owner, repo, token);
      setState({ data: branches, loading: false, error: null });
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch branches";
      setState({ data: null, loading: false, error: errorMessage });
    }
  }, [owner, repo, token]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  return {
    ...state,
    refetch: fetchBranches,
  };
}

// ========================================
// Mutation Helpers
// ========================================

/**
 * Generic mutation hook for async operations
 */
export function useMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | null> => {
      setLoading(true);
      setError(null);

      try {
        const data = await mutationFn(variables);
        setLoading(false);
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
            ? err.message
            : "An error occurred";
        setError(errorMessage);
        setLoading(false);
        return null;
      }
    },
    [mutationFn]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  return {
    mutate,
    loading,
    error,
    reset,
  };
}
