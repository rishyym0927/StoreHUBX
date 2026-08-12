"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/store";
import { versionApi, githubApi } from "@/lib/api";
import { WebhookSetup } from "@/components/common/webhook-setup";
import { AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import type { Component, ComponentVersion, AutoDeployRequest } from "@/types";

interface AutoDeployProps {
  component: Component;
  versions: ComponentVersion[];
  onDeploySuccess?: () => void;
}

export function AutoDeploy({ component, versions, onDeploySuccess }: AutoDeployProps) {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const [checking, setChecking] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [latestCommit, setLatestCommit] = useState<string | null>(null);
  const [hasNewCommit, setHasNewCommit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if component is linked to a repo
  const isLinked = component.repoLink && component.repoLink.owner && component.repoLink.repo;
  
  // Check if current user is the owner
  const isOwner = !!(user && token && user.providerId === component.ownerId);

  // Check for new commits
  const checkForNewCommits = useCallback(async () => {
    if (!isLinked || !token) return;

    setChecking(true);
    setError(null);

    try {
      const branch = await githubApi.getBranch(
        {
          owner: component.repoLink!.owner,
          repo: component.repoLink!.repo,
          branch: component.repoLink!.ref || "main",
        },
        token
      );

      const commitSha = branch.commit.sha;
      setLatestCommit(commitSha);

      // Check if this commit already has a version
      const existingVersion = versions.find((v) => v.commitSha === commitSha);
      setHasNewCommit(!existingVersion);
    } catch (err) {
      console.error("Failed to check for new commits:", err);
      setError("Failed to check for new commits");
    } finally {
      setChecking(false);
    }
  }, [isLinked, token, component.repoLink, versions]);

  // Auto-check on mount
  useEffect(() => {
    if (isLinked) {
      checkForNewCommits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component.id]);

  // Deploy new commit
  const handleDeploy = async () => {
    if (!latestCommit || !token) return;

    setDeploying(true);
    setError(null);
    setSuccess(false);

    try {
      // Auto-generate version number (backend will increment)
      const payload: AutoDeployRequest = {
        commitSha: latestCommit,
        changelog: `Auto-deployed from commit ${latestCommit.substring(0, 7)}`,
      };

      await versionApi.autoDeploy(component.slug, payload, token);
      
      setSuccess(true);
      setHasNewCommit(false);
      
      // Call success callback
      if (onDeploySuccess) {
        onDeploySuccess();
      }

      // Show success message, then softly refresh the page data
      setTimeout(() => {
        router.refresh();
      }, 2000);
    } catch (err) {
      console.error("Failed to deploy:", err);
      setError(err instanceof Error ? err.message : "Failed to deploy new version");
    } finally {
      setDeploying(false);
    }
  };

  if (!isOwner) {
    return null;
  }

  return (
    <div className="border border-black dark:border-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-lg">
              Auto-Deploy
            </h3>
          </div>
          <p className="text-sm font-mono text-black/60 dark:text-white/60 mb-3">
            {component.repoLink!.owner}/{component.repoLink!.repo}
            {component.repoLink!.path && (
              <>
                {" / "}
                <span>{component.repoLink!.path}</span>
              </>
            )}
          </p>

          {error && (
            <div className="mb-3 p-3 border border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950">
              <p className="text-sm font-mono text-red-600 dark:text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</p>
            </div>
          )}

          {success && (
            <div className="mb-3 p-3 border border-green-600 dark:border-green-400 bg-green-50 dark:bg-green-950">
              <p className="text-sm font-mono text-green-600 dark:text-green-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Version deployed successfully! Reloading...
              </p>
            </div>
          )}

          {hasNewCommit && latestCommit && (
            <div className="mb-3 p-3 border border-yellow-600 dark:border-yellow-400 bg-yellow-50 dark:bg-yellow-950">
              <p className="text-sm font-mono text-yellow-800 dark:text-yellow-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 shrink-0" /> New commit detected:{" "}
                <span className="font-mono">{latestCommit.substring(0, 7)}</span>
              </p>
            </div>
          )}

          {!hasNewCommit && latestCommit && !checking && (
            <div className="mb-3 p-3 border border-green-600 dark:border-green-400 bg-green-50 dark:bg-green-950">
              <p className="text-sm font-mono text-green-600 dark:text-green-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Up to date with latest commit:{" "}
                <span className="font-mono">{latestCommit.substring(0, 7)}</span>
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={checkForNewCommits}
            disabled={checking || deploying}
            className="px-4 py-2 border-2 border-black dark:border-white text-sm font-mono transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? (
              <>
                <div className="w-4 h-4 border-2 border-black dark:border-white border-t-transparent dark:border-t-transparent rounded-full animate-spin inline-block mr-2" />
                Checking...
              </>
            ) : (
              "Check Updates"
            )}
          </button>

          {hasNewCommit && (
            <button
              onClick={handleDeploy}
              disabled={deploying || !latestCommit}
              className="px-4 py-2 border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black text-sm font-mono transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deploying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white dark:border-black border-t-transparent dark:border-t-transparent rounded-full animate-spin inline-block mr-2" />
                  Deploying...
                </>
              ) : (
                "Deploy Now"
              )}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-black dark:border-white">
        <details className="text-sm">
          <summary className="cursor-pointer font-mono text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white">
            How does auto-deploy work?
          </summary>
          <div className="mt-2 space-y-1 text-sm font-mono text-black/60 dark:text-white/60">
            <p>• Click &quot;Check Updates&quot; to fetch the latest commit</p>
            <p>• Deploy new commits with one click</p>
            <p>• Auto-incremented version numbers</p>
            <p>• Each commit can only be deployed once</p>
          </div>
        </details>
      </div>

      <WebhookSetup slug={component.slug} />
    </div>
  );
}
