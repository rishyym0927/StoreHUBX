"use client";

import { useEffect, useRef, useState } from "react";
import { useBuildStatus } from "@/hooks/use-api";
import type { BuildJob } from "@/types";
import { formatRelativeTime } from "@/lib/api-utils";
import { buildApi } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { AlertTriangle, Clock, Loader2, CheckCircle2, XCircle, Info, RefreshCw, Package, FileText, type LucideIcon } from "lucide-react";

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
      <div className="border border-black dark:border-white p-6">
        <div className="flex items-center gap-3 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-black dark:border-white border-t-transparent animate-spin" />
          <span>Loading build status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-600 dark:border-red-400 p-4">
        <p className="font-mono text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</p>
      </div>
    );
  }

  if (!build) return null;

  const getStatusConfig = (status: string): { label: string; icon: LucideIcon; color: string; border: string } => {
    switch (status) {
      case "queued":
        return {
          label: "Queued",
          icon: Clock,
          color: "text-yellow-700 dark:text-yellow-400",
          border: "border-yellow-600",
        };
      case "running":
        return {
          label: "Building",
          icon: Loader2,
          color: "text-blue-700 dark:text-blue-400",
          border: "border-blue-600",
        };
      case "success":
        return {
          label: "Success",
          icon: CheckCircle2,
          color: "text-green-700 dark:text-green-400",
          border: "border-green-600",
        };
      case "error":
        return {
          label: "Failed",
          icon: XCircle,
          color: "text-red-700 dark:text-red-400",
          border: "border-red-600",
        };
      default:
        return {
          label: status,
          icon: Info,
          color: "text-black dark:text-white",
          border: "border-black dark:border-white",
        };
    }
  };

  const statusConfig = getStatusConfig(build.status);
  const isPending = build.status === "queued" || build.status === "running";
  const isCompleted = build.status === "success" || build.status === "error";
  const canRebuild = isCompleted && token;

  return (
    <div className={`border-2 ${statusConfig.border} p-6 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {isPending && (
            <div className="w-5 h-5 border-2 border-current border-t-transparent animate-spin" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <statusConfig.icon className={`w-5 h-5 ${statusConfig.color} ${build.status === "running" ? "animate-spin" : ""}`} />
              <h3 className={`font-mono font-bold ${statusConfig.color}`}>
                Build {statusConfig.label}
              </h3>
            </div>
            <p className="text-xs font-mono text-black/60 dark:text-white/60 mt-1">
              Build ID: <span className="font-mono">{build.id}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canRebuild && (
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="px-3 py-1.5 border-2 border-black dark:border-white text-xs font-mono disabled:opacity-50 transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed flex items-center gap-2"
              title="Rebuild this version"
            >
              {rebuilding ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent animate-spin" />
                  <span>Rebuilding...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Rebuild</span>
                </>
              )}
            </button>
          )}
          <div className="text-right text-xs font-mono text-black/60 dark:text-white/60">
            <p>Started {formatRelativeTime(build.createdAt)}</p>
            {build.endedAt && <p>Ended {formatRelativeTime(build.endedAt)}</p>}
          </div>
        </div>
      </div>

      {/* Rebuild Error Message */}
      {rebuildError && (
        <div className="border border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950 p-3">
          <p className="font-mono text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {rebuildError}</p>
        </div>
      )}

      {/* Build Info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-black dark:border-white p-2">
          <p className="font-mono text-black/60 dark:text-white/60 mb-1">Component</p>
          <p className="font-mono font-bold">{build.component}</p>
        </div>
        <div className="border border-black dark:border-white p-2">
          <p className="font-mono text-black/60 dark:text-white/60 mb-1">Version</p>
          <p className="font-mono font-bold">{build.version}</p>
        </div>
        {build.repo && (
          <>
            <div className="border border-black dark:border-white p-2">
              <p className="font-mono text-black/60 dark:text-white/60 mb-1">Repository</p>
              <p className="font-mono font-bold">{build.repo.owner}/{build.repo.repo}</p>
            </div>
            <div className="border border-black dark:border-white p-2">
              <p className="font-mono text-black/60 dark:text-white/60 mb-1">Branch</p>
              <p className="font-mono font-bold">{build.repo.ref}</p>
            </div>
          </>
        )}
      </div>

      {/* Artifacts */}
      {build.artifacts?.bundleUrl && (
        <div className="pt-4 border-t border-black dark:border-white">
          <p className="text-sm font-mono font-bold mb-2 flex items-center gap-1.5"><Package className="w-4 h-4" /> Build Artifacts</p>
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
        <div className="pt-4 border-t border-black dark:border-white">
          <p className="text-sm font-mono font-bold mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4" /> Build Logs</p>
          <div className="bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white p-3 max-h-64 overflow-y-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {build.logs.join('\n')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
