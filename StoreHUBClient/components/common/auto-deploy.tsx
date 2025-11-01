"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/store";
import { versionApi, githubApi } from "@/lib/api";
import type { Component, ComponentVersion, AutoDeployRequest } from "@/types";

interface AutoDeployProps {
  component: Component;
  versions: ComponentVersion[];
  onDeploySuccess?: () => void;
}

export function AutoDeploy({ component, versions, onDeploySuccess }: AutoDeployProps) {
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
  const isOwner = user && token ;

  // Don't show auto-deploy if not owner

  console.log("Rendering AutoDeploy for component:", component.slug);

  // Check for new commits
  const checkForNewCommits = async () => {
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
  };

  // Auto-check on mount
  useEffect(() => {
    if (isLinked) {
      checkForNewCommits();
    }
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

      const result = await versionApi.autoDeploy(component.slug, payload, token);
      
      setSuccess(true);
      setHasNewCommit(false);
      
      // Call success callback
      if (onDeploySuccess) {
        onDeploySuccess();
      }

      // Show success message
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      console.error("Failed to deploy:", err);
      setError(err.message || "Failed to deploy new version");
    } finally {
      setDeploying(false);
    }
  };

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
              <p className="text-sm font-mono text-red-600 dark:text-red-400">⚠️ {error}</p>
            </div>
          )}

          {success && (
            <div className="mb-3 p-3 border border-green-600 dark:border-green-400 bg-green-50 dark:bg-green-950">
              <p className="text-sm font-mono text-green-600 dark:text-green-400">
                ✓ Version deployed successfully! Reloading...
              </p>
            </div>
          )}

          {hasNewCommit && latestCommit && (
            <div className="mb-3 p-3 border border-yellow-600 dark:border-yellow-400 bg-yellow-50 dark:bg-yellow-950">
              <p className="text-sm font-mono text-yellow-800 dark:text-yellow-200">
                🆕 New commit detected:{" "}
                <span className="font-mono">{latestCommit.substring(0, 7)}</span>
              </p>
            </div>
          )}

          {!hasNewCommit && latestCommit && !checking && (
            <div className="mb-3 p-3 border border-green-600 dark:border-green-400 bg-green-50 dark:bg-green-950">
              <p className="text-sm font-mono text-green-600 dark:text-green-400">
                ✓ Up to date with latest commit:{" "}
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
            <p>• Click "Check Updates" to fetch the latest commit</p>
            <p>• Deploy new commits with one click</p>
            <p>• Auto-incremented version numbers</p>
            <p>• Each commit can only be deployed once</p>
          </div>
        </details>
      </div>
    </div>
  );
}
