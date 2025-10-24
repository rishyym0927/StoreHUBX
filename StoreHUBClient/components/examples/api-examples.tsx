"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useComponents, useComponent, useVersions, useBuildStatus, useGitHubRepos, useMutation } from "@/hooks/use-api";
import { componentApi, githubApi } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { 
  formatDate, 
  formatRelativeTime,
  parseFrameworks,
  parseTags,
  isValidComponentName,
  getBuildStatusLabel, 
  getBuildStatusColor,
  getBuildStatusBgColor,
  isBuildPending 
} from "@/lib/api-utils";
import type { ComponentsQueryParams, ComponentCreateRequest, GitHubContent } from "@/types";

// ========================================
// Example 1: Components List with Filters
// ========================================

export function ComponentsListExample() {
  const [filters, setFilters] = useState<ComponentsQueryParams>({
    q: "",
    framework: "",
    tags: "",
    page: 1,
    limit: 10,
  });

  const { data, loading, error, refetch } = useComponents(filters);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <p className="text-red-700 dark:text-red-300">{error}</p>
        <button 
          onClick={refetch}
          className="mt-2 text-sm underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search components..."
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <input
          type="text"
          placeholder="Framework"
          value={filters.framework}
          onChange={(e) => setFilters({ ...filters, framework: e.target.value })}
          className="w-40 px-4 py-2 border rounded-lg"
        />
      </div>

      {/* Results */}
      <div className="grid gap-3">
        {data?.components.map((component) => (
          <a
            key={component.id}
            href={`/components/${component.slug}`}
            className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition"
          >
            <h3 className="font-semibold">{component.name}</h3>
            <p className="text-sm opacity-80 mt-1">{component.description}</p>
            <div className="flex items-center gap-2 mt-3 text-xs opacity-70">
              <span>{component.frameworks.join(", ")}</span>
              <span>•</span>
              <span>{formatDate(component.createdAt)}</span>
            </div>
          </a>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <button
          disabled={filters.page === 1}
          onClick={() => setFilters({ ...filters, page: filters.page! - 1 })}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm">Page {filters.page}</span>
        <button
          onClick={() => setFilters({ ...filters, page: filters.page! + 1 })}
          className="px-4 py-2 border rounded"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ========================================
// Example 2: Create Component Form
// ========================================

"use client";

import { componentApi } from "@/lib/api";
import { useMutation } from "@/hooks/use-api";
import { useAuth } from "@/lib/store";
import { useRouter } from "next/navigation";
import { parseFrameworks, parseTags, isValidComponentName } from "@/lib/api-utils";
import type { ComponentCreateRequest } from "@/types";

export function CreateComponentForm() {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const { mutate, loading, error, reset } = useMutation(
    (data: ComponentCreateRequest) => componentApi.create(data, token!)
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    reset();

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;

    // Validation
    if (!isValidComponentName(name)) {
      alert("Invalid component name. Use only alphanumeric characters, hyphens, and underscores.");
      return;
    }

    const result = await mutate({
      name,
      description: formData.get("description") as string,
      frameworks: parseFrameworks(formData.get("frameworks") as string),
      tags: parseTags(formData.get("tags") as string),
      license: formData.get("license") as string || "MIT",
    });

    if (result) {
      router.push(`/components/${result.component.slug}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Create Component</h1>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <input
        name="name"
        placeholder="Component name"
        required
        className="w-full px-4 py-2 border rounded-lg"
      />

      <textarea
        name="description"
        placeholder="Description"
        rows={3}
        className="w-full px-4 py-2 border rounded-lg"
      />

      <input
        name="frameworks"
        placeholder="Frameworks (e.g., react, vue, svelte)"
        required
        className="w-full px-4 py-2 border rounded-lg"
      />

      <input
        name="tags"
        placeholder="Tags (e.g., ui, button, form)"
        className="w-full px-4 py-2 border rounded-lg"
      />

      <input
        name="license"
        placeholder="License (default: MIT)"
        className="w-full px-4 py-2 border rounded-lg"
      />

      <button
        type="submit"
        disabled={loading || !token}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create Component"}
      </button>
    </form>
  );
}

// ========================================
// Example 3: Component Detail with Versions
// ========================================

"use client";

import { useComponent, useVersions } from "@/hooks/use-api";
import { formatDate, formatRelativeTime } from "@/lib/api-utils";

export function ComponentDetailExample({ slug }: { slug: string }) {
  const { data: component, loading: componentLoading } = useComponent(slug);
  const { data: versions, loading: versionsLoading } = useVersions(slug);

  if (componentLoading) {
    return <div>Loading component...</div>;
  }

  if (!component) {
    return <div>Component not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Component Header */}
      <div>
        <h1 className="text-3xl font-bold">{component.name}</h1>
        <p className="text-lg opacity-80 mt-2">{component.description}</p>
        <div className="flex gap-2 mt-4">
          {component.frameworks.map((fw) => (
            <span
              key={fw}
              className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-sm"
            >
              {fw}
            </span>
          ))}
        </div>
        <p className="text-sm opacity-70 mt-3">
          Created {formatDate(component.createdAt)} • {component.license}
        </p>
      </div>

      {/* Versions */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Versions</h2>
        {versionsLoading ? (
          <div>Loading versions...</div>
        ) : versions && versions.length > 0 ? (
          <div className="space-y-2">
            {versions.map((version) => (
              <div
                key={version.id}
                className="p-4 border rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{version.version}</span>
                  <span className="text-sm opacity-70">
                    {formatRelativeTime(version.createdAt)}
                  </span>
                </div>
                {version.changelog && (
                  <p className="text-sm opacity-80 mt-2">{version.changelog}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm opacity-70">No versions yet</p>
        )}
      </div>
    </div>
  );
}

// ========================================
// Example 4: Build Status Monitor
// ========================================

"use client";

import { useBuildStatus } from "@/hooks/use-api";
import { 
  getBuildStatusLabel, 
  getBuildStatusColor,
  getBuildStatusBgColor,
  isBuildPending 
} from "@/lib/api-utils";

export function BuildStatusMonitor({ buildId }: { buildId: string }) {
  // Auto-refreshes every 5 seconds while build is pending
  const { data: build, loading, error } = useBuildStatus(buildId, true);

  if (loading && !build) {
    return <div>Loading build status...</div>;
  }

  if (error) {
    return <div className="text-red-600">Error: {error}</div>;
  }

  if (!build) {
    return null;
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Status Badge */}
      <div className="flex items-center gap-3">
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getBuildStatusBgColor(build.status)}`}>
          <span className={getBuildStatusColor(build.status)}>
            {getBuildStatusLabel(build.status)}
          </span>
        </span>
        {isBuildPending(build.status) && (
          <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
        )}
      </div>

      {/* Build Info */}
      <div className="text-sm space-y-1">
        <div>
          <span className="opacity-70">Component:</span>{" "}
          <span className="font-medium">{build.component}</span>
        </div>
        <div>
          <span className="opacity-70">Version:</span>{" "}
          <span className="font-mono">{build.version}</span>
        </div>
      </div>

      {/* Build Logs */}
      {build.logs && build.logs.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Build Logs</h4>
          <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-xs space-y-1 max-h-60 overflow-y-auto">
            {build.logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* Artifacts */}
      {build.artifacts?.bundleUrl && (
        <div>
          <h4 className="text-sm font-medium mb-2">Artifacts</h4>
          <a
            href={build.artifacts.bundleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 text-sm underline"
          >
            Download Bundle
          </a>
        </div>
      )}
    </div>
  );
}

// ========================================
// Example 5: GitHub Repository Browser
// ========================================

"use client";

import { useGitHubRepos } from "@/hooks/use-api";
import { githubApi } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { useState } from "react";
import type { GitHubContent } from "@/types";

export function GitHubReposBrowser() {
  const token = useAuth((s) => s.token);
  const { data: repos, loading } = useGitHubRepos();
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [contents, setContents] = useState<GitHubContent[]>([]);
  const [currentPath, setCurrentPath] = useState("");

  const browseFolder = async (owner: string, repo: string, path = "") => {
    if (!token) return;

    try {
      const files = await githubApi.getContents({ owner, repo, path }, token);
      setContents(files);
      setCurrentPath(path);
    } catch (error) {
      console.error("Failed to browse folder:", error);
    }
  };

  if (loading) {
    return <div>Loading repositories...</div>;
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Repositories List */}
      <div>
        <h3 className="font-semibold mb-3">Your Repositories</h3>
        <div className="space-y-2">
          {repos?.map((repo) => (
            <button
              key={repo.id}
              onClick={() => {
                setSelectedRepo(repo.full_name);
                browseFolder(repo.owner.login, repo.name);
              }}
              className={`w-full text-left p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 ${
                selectedRepo === repo.full_name ? "border-blue-500" : ""
              }`}
            >
              <div className="font-medium">{repo.name}</div>
              {repo.description && (
                <div className="text-sm opacity-70 mt-1">{repo.description}</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contents Browser */}
      <div>
        <h3 className="font-semibold mb-3">
          Contents {currentPath && `- ${currentPath}`}
        </h3>
        <div className="space-y-2">
          {contents.map((item) => (
            <div
              key={item.path}
              className="p-3 border rounded-lg flex items-center gap-3"
            >
              <span>{item.type === "dir" ? "📁" : "📄"}</span>
              <span className="flex-1">{item.name}</span>
              {item.type === "dir" && selectedRepo && (
                <button
                  onClick={() => {
                    const [owner, repo] = selectedRepo.split("/");
                    browseFolder(owner, repo, item.path);
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400"
                >
                  Open →
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
