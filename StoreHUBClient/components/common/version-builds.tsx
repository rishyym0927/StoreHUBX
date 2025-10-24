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
      <div className="p-6 border-4 border-black dark:border-white bg-white dark:bg-black">
        <div className="flex items-center gap-3 font-black">
          <div className="w-6 h-6 border-4 border-black dark:border-white border-t-transparent animate-spin" />
          <span className="uppercase tracking-wide">Loading builds...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border-4 border-red-600 bg-white dark:bg-black">
        <div className="flex items-center gap-3">
          <span className="text-4xl">⚠️</span>
          <p className="font-black text-red-600 uppercase">{error}</p>
        </div>
      </div>
    );
  }

  if (!builds || builds.length === 0) {
    return (
      <div className="p-6 border-4 border-black dark:border-white bg-white dark:bg-black text-center">
        <span className="text-5xl mb-3 block">📦</span>
        <p className="font-black uppercase">No builds yet</p>
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
      <div className="flex items-center justify-between pb-4 border-b-2 border-black dark:border-white">
        <h4 className="font-black uppercase tracking-wide">Build History ({builds.length})</h4>
        {token && (
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="px-4 py-2.5 bg-black dark:bg-white text-white dark:text-black border-2 border-black dark:border-white disabled:opacity-50 font-black uppercase text-xs tracking-wide transition-transform duration-200 hover:scale-105 flex items-center gap-2 disabled:cursor-not-allowed"
            title="Trigger a new build"
          >
            {rebuilding ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin" />
                <span>Building...</span>
              </>
            ) : (
              <>
                <span className="text-lg">🔄</span>
                <span>Rebuild</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Rebuild Error Message */}
      {rebuildError && (
        <div className="border-4 border-red-600 bg-white dark:bg-black p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <p className="font-black text-red-600 uppercase text-sm">{rebuildError}</p>
          </div>
        </div>
      )}
      
      <div className="space-y-4">
        {builds.map((build) => {
          const statusConfig = getStatusConfig(build.status);
          const isExpanded = expandedBuildId === build.id;

          return (
            <div
              key={build.id}
              className={`border-4 ${statusConfig.border} bg-white dark:bg-black overflow-hidden transition-all`}
            >
              {/* Build Header - Clickable */}
              <button
                onClick={() => toggleBuildExpansion(build.id)}
                className="w-full p-4 text-left hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{statusConfig.icon}</span>
                    <span className={`font-black uppercase tracking-wide ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                    <span className="text-xs font-mono font-bold opacity-60">
                      #{build.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-black opacity-70 uppercase">
                      {formatRelativeTime(build.createdAt)}
                    </span>
                    <span className="text-xl font-black">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded Build Details */}
              {isExpanded && (
                <div className="border-t-4 border-current p-4 space-y-4">
                  {/* Build Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {build.repo && (
                      <>
                        <div className="border-2 border-black dark:border-white p-3">
                          <p className="font-black uppercase text-xs opacity-60 mb-1">Repository</p>
                          <p className="font-mono font-bold">{build.repo.owner}/{build.repo.repo}</p>
                        </div>
                        <div className="border-2 border-black dark:border-white p-3">
                          <p className="font-black uppercase text-xs opacity-60 mb-1">Branch/Ref</p>
                          <p className="font-mono font-bold">{build.repo.ref}</p>
                        </div>
                        {build.repo.commit && (
                          <div className="border-2 border-black dark:border-white p-3">
                            <p className="font-black uppercase text-xs opacity-60 mb-1">Commit</p>
                            <p className="font-mono font-bold">{build.repo.commit.slice(0, 7)}</p>
                          </div>
                        )}
                        {build.repo.path && (
                          <div className="border-2 border-black dark:border-white p-3">
                            <p className="font-black uppercase text-xs opacity-60 mb-1">Path</p>
                            <p className="font-mono font-bold">{build.repo.path}</p>
                          </div>
                        )}
                      </>
                    )}
                    <div className="border-2 border-black dark:border-white p-3">
                      <p className="font-black uppercase text-xs opacity-60 mb-1">Started</p>
                      <p className="font-bold">{build.startedAt ? formatRelativeTime(build.startedAt) : "—"}</p>
                    </div>
                    <div className="border-2 border-black dark:border-white p-3">
                      <p className="font-black uppercase text-xs opacity-60 mb-1">Completed</p>
                      <p className="font-bold">{build.endedAt ? formatRelativeTime(build.endedAt) : "—"}</p>
                    </div>
                  </div>

                  {/* Artifacts */}
                  {build.artifacts?.bundleUrl && (
                    <div className="pt-4 border-t-2 border-black dark:border-white">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">📦</span>
                        <p className="font-black uppercase text-sm">Bundle</p>
                      </div>
                      <a
                        href={build.artifacts.bundleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-mono font-bold break-all"
                      >
                        {build.artifacts.bundleUrl}
                      </a>
                    </div>
                  )}

                  {/* Logs */}
                  {build.logs && build.logs.length > 0 && (
                    <div className="pt-4 border-t-2 border-black dark:border-white">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">📋</span>
                        <p className="font-black uppercase text-sm">Build Logs</p>
                      </div>
                      <div className="bg-black dark:bg-white text-white dark:text-black border-2 border-black dark:border-white p-4 max-h-64 overflow-y-auto">
                        <pre className="text-xs font-mono font-bold whitespace-pre-wrap">
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
