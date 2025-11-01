"use client";

import { useState } from "react";
import { useBuilds } from "@/hooks/use-api";
import { formatRelativeTime } from "@/lib/api-utils";
import type { BuildJob } from "@/types";
import { buildApi } from "@/lib/api";
import { useAuth } from "@/lib/store";

interface VersionBuildsProps {
  slug: string;
  version: string;
}

export function VersionBuilds({ slug, version }: VersionBuildsProps) {
  const { data: builds, loading, error } = useBuilds(slug, version);
  const [expandedBuildId, setExpandedBuildId] = useState<string | null>(null);
  const { token } = useAuth();
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="p-6 border border-black dark:border-white">
        <div className="flex items-center gap-3 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-black dark:border-white border-t-transparent animate-spin" />
          <span>Loading builds...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border border-red-600 dark:border-red-400">
        <p className="font-mono text-sm text-red-600 dark:text-red-400">⚠️ {error}</p>
      </div>
    );
  }

  if (!builds || builds.length === 0) {
    return (
      <div className="p-6 border border-black dark:border-white text-center">
        <p className="font-mono text-sm text-black/60 dark:text-white/60">No builds yet</p>
      </div>
    );
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "queued":
        return {
          label: "Queued",
          icon: "⏱️",
          color: "text-yellow-700 dark:text-yellow-400",
          border: "border-yellow-600",
        };
      case "running":
        return {
          label: "Building",
          icon: "⚙️",
          color: "text-blue-700 dark:text-blue-400",
          border: "border-blue-600",
        };
      case "success":
        return {
          label: "Success",
          icon: "✅",
          color: "text-green-700 dark:text-green-400",
          border: "border-green-600",
        };
      case "error":
        return {
          label: "Failed",
          icon: "❌",
          color: "text-red-700 dark:text-red-400",
          border: "border-red-600",
        };
      default:
        return {
          label: status,
          icon: "ℹ️",
          color: "text-black dark:text-white",
          border: "border-black dark:border-white",
        };
    }
  };

  const toggleBuildExpansion = (buildId: string) => {
    setExpandedBuildId(expandedBuildId === buildId ? null : buildId);
  };

  const handleRebuild = async () => {
    if (!token) return;
    
    setRebuilding(true);
    setRebuildError(null);
    
    try {
      await buildApi.enqueue(slug, version, token);
      // Refresh the page to show the new build
      window.location.reload();
    } catch (err) {
      setRebuildError(err instanceof Error ? err.message : "Failed to rebuild");
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-black dark:border-white">
        <h4 className="font-mono text-sm font-bold">Build History ({builds.length})</h4>
        {token && (
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="px-3 py-1.5 border-2 border-black dark:border-white text-xs font-mono disabled:opacity-50 transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed"
            title="Trigger a new build"
          >
            {rebuilding ? "Building..." : "Rebuild"}
          </button>
        )}
      </div>

      {/* Rebuild Error Message */}
      {rebuildError && (
        <div className="border border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950 p-3">
          <p className="font-mono text-xs text-red-600 dark:text-red-400">⚠️ {rebuildError}</p>
        </div>
      )}
      
      <div className="space-y-3">
        {builds.map((build) => {
          const statusConfig = getStatusConfig(build.status);
          const isExpanded = expandedBuildId === build.id;

          return (
            <div
              key={build.id}
              className={`border ${statusConfig.border}`}
            >
              {/* Build Header - Clickable */}
              <button
                onClick={() => toggleBuildExpansion(build.id)}
                className="w-full p-3 text-left hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`font-mono text-sm font-bold ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                    <span className="text-xs font-mono text-black/60 dark:text-white/60">
                      #{build.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-black/60 dark:text-white/60">
                      {formatRelativeTime(build.createdAt)}
                    </span>
                    <span className="text-sm">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded Build Details */}
              {isExpanded && (
                <div className="border-t border-current p-3 space-y-3">
                  {/* Build Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {build.repo && (
                      <>
                        <div className="border border-black dark:border-white p-2">
                          <p className="font-mono text-black/60 dark:text-white/60 mb-1">Repository</p>
                          <p className="font-mono font-bold">{build.repo.owner}/{build.repo.repo}</p>
                        </div>
                        <div className="border border-black dark:border-white p-2">
                          <p className="font-mono text-black/60 dark:text-white/60 mb-1">Branch/Ref</p>
                          <p className="font-mono font-bold">{build.repo.ref}</p>
                        </div>
                        {build.repo.commit && (
                          <div className="border border-black dark:border-white p-2">
                            <p className="font-mono text-black/60 dark:text-white/60 mb-1">Commit</p>
                            <p className="font-mono font-bold">{build.repo.commit.slice(0, 7)}</p>
                          </div>
                        )}
                        {build.repo.path && (
                          <div className="border border-black dark:border-white p-2">
                            <p className="font-mono text-black/60 dark:text-white/60 mb-1">Path</p>
                            <p className="font-mono font-bold">{build.repo.path}</p>
                          </div>
                        )}
                      </>
                    )}
                    <div className="border border-black dark:border-white p-2">
                      <p className="font-mono text-black/60 dark:text-white/60 mb-1">Started</p>
                      <p className="font-mono">{build.startedAt ? formatRelativeTime(build.startedAt) : "—"}</p>
                    </div>
                    <div className="border border-black dark:border-white p-2">
                      <p className="font-mono text-black/60 dark:text-white/60 mb-1">Completed</p>
                      <p className="font-mono">{build.endedAt ? formatRelativeTime(build.endedAt) : "—"}</p>
                    </div>
                  </div>

                  {/* Artifacts */}
                  {build.artifacts?.bundleUrl && (
                    <div className="pt-3 border-t border-black dark:border-white">
                      <p className="font-mono text-xs font-bold mb-2">Bundle</p>
                      <a
                        href={build.artifacts.bundleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono hover:underline break-all"
                      >
                        {build.artifacts.bundleUrl}
                      </a>
                    </div>
                  )}

                  {/* Logs */}
                  {build.logs && build.logs.length > 0 && (
                    <div className="pt-3 border-t border-black dark:border-white">
                      <p className="font-mono text-xs font-bold mb-2">Build Logs</p>
                      <div className="bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white p-3 max-h-64 overflow-y-auto">
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {build.logs.join('\n')}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
