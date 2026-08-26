"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/store";
import {
  componentApi,
  versionApi,
  buildApi,
  githubApi,
  notificationApi,
  ApiError,
} from "@/lib/api";
import type {
  Component,
  ComponentVersion,
  BuildJob,
  GitHubRepo,
  ComponentsQueryParams,
  Notification,
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
    if (!buildId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const build = await buildApi.getStatus(buildId, token ?? undefined);
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
    if (!buildId) return;

    let cancelled = false;

    fetchBuild();

    // Auto-refresh for pending builds
    if (autoRefresh) {
      const interval = setInterval(async () => {
        try {
          const build = await buildApi.getStatus(buildId, token ?? undefined);
          if (cancelled) return;
          setState({ data: build, loading: false, error: null });

          // Stop polling if build is complete
          if (build.status === "success" || build.status === "error") {
            clearInterval(interval);
          }
        } catch (err) {
          if (cancelled) return;
          const errorMessage =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
              ? err.message
              : "Failed to fetch build status";
          // Keep the last-known-good data on a transient poll failure
          // instead of blanking the UI to an error state.
          setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
        }
      }, 3000); // Poll every 3 seconds for live log updates

      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [buildId, token, autoRefresh, fetchBuild]);

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
  // Mirrors state.data so the polling interval can read the latest builds
  // without pulling them out of a setState updater (updaters must stay
  // pure — React may invoke them more than once, e.g. under StrictMode,
  // which would double the network call).
  const dataRef = useRef<BuildJob[] | null>(null);

  const fetchBuilds = useCallback(async () => {
    if (!slug || !version) {
      setState({ data: null, loading: false, error: null });
      dataRef.current = null;
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const builds = await buildApi.list(slug, version, token ?? undefined);
      setState({ data: builds, loading: false, error: null });
      dataRef.current = builds;
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch builds";
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
    }
  }, [slug, version, token]);

  useEffect(() => {
    if (!slug || !version) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const builds = await buildApi.list(slug, version, token ?? undefined);
        if (cancelled) return;
        setState({ data: builds, loading: false, error: null });
        dataRef.current = builds;
      } catch (err) {
        if (cancelled) return;
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
            ? err.message
            : "Failed to fetch builds";
        // Keep the last-known-good data on a transient poll failure
        // instead of blanking the UI to an error state.
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
      }
    };

    poll();

    // Keep polling while any build is still queued/running, so the
    // list picks up live status/log updates without a manual refresh.
    const interval = setInterval(() => {
      const hasActiveBuild = dataRef.current?.some(
        (b) => b.status === "queued" || b.status === "running"
      );
      if (hasActiveBuild) poll();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slug, version, token]);

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
// Notification Hooks
// ========================================

/**
 * Hook to fetch the caller's notification feed, polling on an interval.
 *
 * Polling (rather than SSE) because the backend exposes a plain list
 * endpoint; ticks are skipped while the tab is hidden so a backgrounded
 * tab doesn't keep hitting the API.
 */
export function useNotifications(pollIntervalMs = 60000) {
  const token = useAuth((s) => s.token);
  const [state, setState] = useState<
    UseApiState<{ notifications: Notification[]; unreadCount: number }>
  >({ data: null, loading: true, error: null });

  const fetchNotifications = useCallback(async () => {
    if (!token) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    try {
      const response = await notificationApi.list(token);
      setState({ data: response, loading: false, error: null });
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch notifications";
      setState({ data: null, loading: false, error: errorMessage });
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const response = await notificationApi.list(token);
        if (cancelled) return;
        setState({ data: response, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
            ? err.message
            : "Failed to fetch notifications";
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
      }
    };

    poll();
    const interval = setInterval(poll, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, pollIntervalMs]);

  /**
   * Apply a local change without waiting for the next poll — read-marking
   * should feel instant.
   */
  const patch = useCallback(
    (updater: (prev: { notifications: Notification[]; unreadCount: number }) => {
      notifications: Notification[];
      unreadCount: number;
    }) => {
      setState((prev) => (prev.data ? { ...prev, data: updater(prev.data) } : prev));
    },
    []
  );

  return { ...state, refetch: fetchNotifications, patch };
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
