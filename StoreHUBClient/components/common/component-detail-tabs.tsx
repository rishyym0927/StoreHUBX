"use client";

import { useState } from "react";
import { Component, ComponentVersion } from "@/types";
import { VersionsDisplay } from "./version-list";
import { AutoDeploy } from "./auto-deploy";
import { PreviewIframe } from "./preview-iframe";
import { Markdown } from "./markdown";
import { useBuilds } from "@/hooks/use-api";

interface ComponentDetailTabsProps {
  component: Component;
  versions: ComponentVersion[];
  readme?: string | null;
}

export function ComponentDetailTabs({ component, versions, readme }: ComponentDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<"versions" | "preview" | "builds" | "readme">("versions");

  const latestVersion = versions && versions.length > 0 ? versions[0] : null;
  const isLinked = component.repoLink && component.repoLink.owner && component.repoLink.repo;
  // Preview URL is derived from the latest build for the latest version —
  // ComponentVersion no longer carries its own previewUrl field.
  const { data: latestVersionBuilds } = useBuilds(component.slug, latestVersion?.version ?? "");
  const previewUrl = latestVersionBuilds?.find((b) => b.status === "success")?.artifacts?.bundleUrl;
  const hasPreview = !!previewUrl;
  const hasReadme = !!readme;

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b-2 border-black dark:border-white overflow-x-auto">
        <button
          onClick={() => setActiveTab("versions")}
          className={`font-mono text-sm px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "versions"
              ? "border-black dark:border-white font-bold -mb-0.5"
              : "border-transparent text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
          }`}
        >
          Versions ({versions.length})
        </button>
        
        {hasPreview && (
          <button
            onClick={() => setActiveTab("preview")}
            className={`font-mono text-sm px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "preview"
                ? "border-black dark:border-white font-bold -mb-0.5"
                : "border-transparent text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
            }`}
          >
            Preview
          </button>
        )}
        
        {isLinked && (
          <button
            onClick={() => setActiveTab("builds")}
            className={`font-mono text-sm px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "builds"
                ? "border-black dark:border-white font-bold -mb-0.5"
                : "border-transparent text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
            }`}
          >
            Auto-Deploy
          </button>
        )}

        {hasReadme && (
          <button
            onClick={() => setActiveTab("readme")}
            className={`font-mono text-sm px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "readme"
                ? "border-black dark:border-white font-bold -mb-0.5"
                : "border-transparent text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
            }`}
          >
            README
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "versions" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Versions</h2>
              <p className="text-xs font-mono text-black/60 dark:text-white/60">
                {versions.length > 0 
                  ? `${versions.length} version${versions.length > 1 ? 's' : ''} available` 
                  : 'No versions published yet'}
              </p>
            </div>
            <VersionsDisplay
              slug={component.slug}
              versions={versions}
              ownerId={component.ownerId}
              collaborators={component.collaborators}
            />
          </div>
        )}

        {activeTab === "preview" && hasPreview && latestVersion && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                Live Preview
              </h2>
              <p className="text-xs font-mono text-black/60 dark:text-white/60">
                Version: {latestVersion.version}
              </p>
            </div>
            <PreviewIframe
              url={previewUrl}
              height={600}
            />
          </div>
        )}

        {activeTab === "builds" && isLinked && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                Auto-Deploy
              </h2>
              <p className="text-xs font-mono text-black/60 dark:text-white/60">
                Automatically deploy new versions from GitHub commits
              </p>
            </div>
            <AutoDeploy component={component} versions={versions} />
          </div>
        )}

        {activeTab === "readme" && hasReadme && (
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">README</h2>
            <Markdown content={readme} />
          </div>
        )}
      </div>
    </div>
  );
}
