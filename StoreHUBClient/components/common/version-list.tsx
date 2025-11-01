"use client";

import { useState } from "react";
import { Tabs } from "@/components/common/tabs";
import { PreviewIframe } from "@/components/common/preview-iframe";
import { Markdown } from "@/components/common/markdown";
import { VersionBuilds } from "@/components/common/version-builds";
import { previewApi } from "@/lib/api";

export type VersionDoc = {
  version: string;
  changelog?: string;
  readme?: string;
  usage?: string;
  codeUrl?: string;
  previewUrl?: string | null;
  commitSha?: string;
  createdAt: string;
};

function toISODate(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString('en-GB', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

// Main component that shows latest version with a selector for other versions
export function VersionsDisplay({
  slug,
  versions,
}: {
  slug: string;
  versions: VersionDoc[];
}) {
  const [selectedVersion, setSelectedVersion] = useState<string>(versions[0]?.version || "");

  if (!versions || versions.length === 0) {
    return (
      <div className="p-12 border border-black dark:border-white text-center">
        <p className="text-lg font-bold mb-2">No versions yet</p>
        <p className="text-sm font-mono text-black/60 dark:text-white/60">
          Add your first version to get started
        </p>
      </div>
    );
  }

  // Find the selected version data
  const currentVersion = versions.find(v => v.version === selectedVersion) || versions[0];
  const hasMultipleVersions = versions.length > 1;

  return (
    <div className="space-y-6">
      {/* Version Selector */}
      {hasMultipleVersions && (
        <div className="border border-black dark:border-white p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label htmlFor="version-select" className="text-sm font-mono text-black/60 dark:text-white/60 whitespace-nowrap">
              Select Version:
            </label>
            <select
              id="version-select"
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="flex-1 px-3 py-2 border-2 border-black dark:border-white bg-white dark:bg-black font-mono text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            >
              {versions.map((v, index) => (
                <option key={v.version} value={v.version}>
                  {v.version} {index === 0 ? "(Latest)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Show single version */}
      <VersionsList slug={slug} versions={[currentVersion]} />
    </div>
  );
}

export function VersionsList({
  slug,
  versions,
}: {
  slug: string;
  versions: VersionDoc[];
}) {
  if (!versions || versions.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-6">
      {versions.map((v) => {
        // Build tabs array dynamically based on available content
        const tabs = [];
        
        // Always show Builds tab first
        tabs.push({ id: "builds", label: "Builds" });
        
        // Always show Preview tab - it will use the redirect API endpoint
        tabs.push({ id: "preview", label: "Preview" });
        
        // Show README tab if readme exists
        if (v.readme) {
          tabs.push({ id: "readme", label: "README" });
        }
        
        // Show Usage tab if usage exists
        if (v.usage) {
          tabs.push({ id: "usage", label: "Usage" });
        }
        
        // Show Code tab if codeUrl exists
        if (v.codeUrl) {
          tabs.push({ id: "code", label: "Code" });
        }
        
        // Default to builds tab
        const initialTab = "builds";

        return (
          <li key={v.version + v.createdAt} className="border border-black dark:border-white">
            {/* Version Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-4 sm:p-6 border-b border-black dark:border-white">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-xl sm:text-2xl font-mono mb-2">{v.version}</div>
                {v.changelog && (
                  <p className="text-sm font-mono text-black/60 dark:text-white/60 mb-2">
                    {v.changelog}
                  </p>
                )}
                {v.commitSha && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-black/60 dark:text-white/60">
                      Commit:
                    </span>
                    <code className="text-xs font-mono border border-black dark:border-white px-2 py-1">
                      {v.commitSha.substring(0, 7)}
                    </code>
                  </div>
                )}
              </div>
              <span className="text-xs sm:text-sm font-mono text-black/60 dark:text-white/60 whitespace-nowrap" suppressHydrationWarning>
                {toISODate(v.createdAt)}
              </span>
            </div>

            {/* Tabs Content */}
            <div className="p-4 sm:p-6">
              <Tabs tabs={tabs} initial={initialTab}>
                {(active) => {
                  if (active === "builds") return <VersionBuilds slug={slug} version={v.version} />;
                  if (active === "readme") return <Markdown content={v.readme} />;
                  if (active === "usage") return <Markdown content={v.usage} />;
                  if (active === "preview") {
                    // Use the actual previewUrl from the version data if available
                    const previewUrl = v.previewUrl || previewApi.getPreviewUrl(slug, v.version);
                    return <PreviewIframe url={previewUrl} />;
                  }
                  if (active === "code") {
                    return (
                      <div className="p-8 border border-black dark:border-white text-center">
                        <a 
                          href={v.codeUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-block font-mono text-sm hover:underline"
                        >
                          View Code on GitHub →
                        </a>
                      </div>
                    );
                  }
                  return null;
                }}
              </Tabs>
            </div>
          </li>
        );
      })}
    </ul>
  );
}