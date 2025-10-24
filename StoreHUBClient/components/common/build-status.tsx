"use client";

import { useEffect, useRef, useState } from "react";
import { useBuildStatus } from "@/hooks/use-api";
import type { BuildJob } from "@/types";
import { formatRelativeTime } from "@/lib/api-utils";
import { buildApi } from "@/lib/api";
import { useAuth } from "@/lib/store";

interface BuildStatusProps {
  buildId: string | null;
  autoRefresh?: boolean;
  onComplete?: (build: BuildJob) => void;
  onRebuild?: (newBuildId: string) => void;
}

export function BuildStatus({ buildId, autoRefresh = true, onComplete, onRebuild }: BuildStatusProps) {
  const { data: build, loading, error } = useBuildStatus(buildId, autoRefresh);
  const completedRef = useRef(false);
  const { token } = useAuth();
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  // Call onComplete when build finishes (only once)
  useEffect(() => {
    if (build && onComplete && !completedRef.current && (build.status === "success" || build.status === "error")) {
      completedRef.current = true;
      onComplete(build);
    }
  }, [build, onComplete]);

  const handleRebuild = async () => {
    if (!build || !token) return;
    
    setRebuilding(true);
    setRebuildError(null);
    
    try {
      const response = await buildApi.enqueue(build.component, build.version, token);
      if (response.jobId) {
        onRebuild?.(response.jobId);
      }
    } catch (err) {
      setRebuildError(err instanceof Error ? err.message : "Failed to rebuild");
    } finally {
      setRebuilding(false);
    }
  };

  if (!buildId) return null;

  if (loading && !build) {
    return (
      <div className="border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm opacity-70">Loading build status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-2 border-red-500/50 bg-red-500/10 rounded-xl p-4">
        <p className="text-sm text-red-600 dark:text-red-400">⚠️ {error}</p>
      </div>
    );
  }

  if (!build) return null;

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "queued":
        return {
          label: "Queued",
          icon: "⏱️",
          color: "text-yellow-700 dark:text-yellow-300",
          bg: "bg-yellow-50 dark:bg-yellow-900/20",
          border: "border-yellow-300 dark:border-yellow-700",
        };
      case "running":
        return {
          label: "Building",
          icon: "⚙️",
          color: "text-blue-700 dark:text-blue-300",
          bg: "bg-blue-50 dark:bg-blue-900/20",
          border: "border-blue-300 dark:border-blue-700",
        };
      case "success":
        return {
          label: "Success",
          icon: "✅",
          color: "text-green-700 dark:text-green-300",
          bg: "bg-green-50 dark:bg-green-900/20",
          border: "border-green-300 dark:border-green-700",
        };
      case "error":
        return {
          label: "Failed",
          icon: "❌",
          color: "text-red-700 dark:text-red-300",
          bg: "bg-red-50 dark:bg-red-900/20",
          border: "border-red-300 dark:border-red-700",
        };
      default:
        return {
          label: status,
          icon: "ℹ️",
          color: "text-gray-700 dark:text-gray-300",
          bg: "bg-gray-50 dark:bg-gray-900/20",
          border: "border-gray-300 dark:border-gray-700",
        };
    }
  };

  const statusConfig = getStatusConfig(build.status);
  const isPending = build.status === "queued" || build.status === "running";
  const isCompleted = build.status === "success" || build.status === "error";
  const canRebuild = isCompleted && token;

  return (
    <div className={`border-2 ${statusConfig.border} ${statusConfig.bg} rounded-xl p-6 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isPending && (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">{statusConfig.icon}</span>
              <h3 className={`font-semibold ${statusConfig.color}`}>
                Build {statusConfig.label}
              </h3>
            </div>
            <p className="text-xs opacity-70 mt-1">
              Build ID: <span className="font-mono">{build.id}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canRebuild && (
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2 disabled:cursor-not-allowed"
              title="Rebuild this version"
            >
              {rebuilding ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Rebuilding...</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>Rebuild</span>
                </>
              )}
            </button>
          )}
          <div className="text-right text-sm opacity-70">
            <p>Started {formatRelativeTime(build.createdAt)}</p>
            {build.endedAt && <p>Ended {formatRelativeTime(build.endedAt)}</p>}
          </div>
        </div>
      </div>

      {/* Rebuild Error Message */}
      {rebuildError && (
        <div className="border-2 border-red-500/50 bg-red-500/10 rounded-lg p-3">
          <p className="text-sm text-red-600 dark:text-red-400">⚠️ {rebuildError}</p>
        </div>
      )}

      {/* Build Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="opacity-70 mb-1">Component</p>
          <p className="font-mono font-medium">{build.component}</p>
        </div>
        <div>
          <p className="opacity-70 mb-1">Version</p>
          <p className="font-mono font-medium">{build.version}</p>
        </div>
        {build.repo && (
          <>
            <div>
              <p className="opacity-70 mb-1">Repository</p>
              <p className="font-mono text-xs">{build.repo.owner}/{build.repo.repo}</p>
            </div>
            <div>
              <p className="opacity-70 mb-1">Branch</p>
              <p className="font-mono text-xs">{build.repo.ref}</p>
            </div>
          </>
        )}
      </div>

      {/* Artifacts */}
      {build.artifacts?.bundleUrl && (
        <div className="pt-4 border-t">
          <p className="text-sm font-medium mb-2">📦 Build Artifacts</p>
          <a
            href={build.artifacts.bundleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-mono"
          >
            {build.artifacts.bundleUrl}
          </a>
        </div>
      )}

      {/* Logs */}
      {build.logs && build.logs.length > 0 && (
        <div className="pt-4 border-t">
          <p className="text-sm font-medium mb-2">📋 Build Logs</p>
          <div className="bg-black/5 dark:bg-black/30 rounded-lg p-3 max-h-64 overflow-y-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {build.logs.join('\n')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
