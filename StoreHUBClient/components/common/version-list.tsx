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
      <div className="p-8 border-2 border-black dark:border-white bg-white dark:bg-black text-center">
        <span className="text-6xl mb-4 block">📦</span>
        <p className="font-black uppercase text-lg">No versions yet.</p>
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
        <div className="flex items-center gap-4 p-4 border-2 border-black dark:border-white bg-white dark:bg-black">
          <label htmlFor="version-select" className="font-black uppercase text-sm tracking-wide flex items-center gap-2">
            <span className="text-2xl">🏷️</span>
            <span>Select Version:</span>
          </label>
          <select
            id="version-select"
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="flex-1 max-w-xs px-4 py-2 border-2 border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-bold uppercase text-sm tracking-wide cursor-pointer hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          >
            {versions.map((v, index) => (
              <option key={v.version} value={v.version}>
                {v.version} {index === 0 ? "(Latest)" : ""} {v.changelog ? `- ${v.changelog}` : ""}
              </option>
            ))}
          </select>
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
  console.log("Rendering VersionsList for", slug, versions);

  return (
    <ul className="space-y-6">
      {versions.map((v) => {
        // Build tabs array dynamically based on available content
        const tabs = [];
        
        // Always show Builds tab first
        tabs.push({ id: "builds", label: "Builds" });
        
        // Always show Preview tab - it will use the redirect API endpoint
        // The backend will handle redirecting to the actual preview URL
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
          <li key={v.version + v.createdAt} className="border-2 border-black dark:border-white p-6 bg-white dark:bg-black">
            <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-black dark:border-white">
              <div className="flex items-center gap-4">
                <span className="text-3xl">🏷️</span>
                <div>
                  <div className="font-black text-2xl font-mono">{v.version}</div>
                  {v.changelog && (
                    <div className="font-bold text-sm opacity-70 mt-1">{v.changelog}</div>
                  )}
                </div>
              </div>
              {/* Use a deterministic format and suppress hydration warnings */}
              <span className="text-sm font-black opacity-70 border-2 border-black dark:border-white px-3 py-1" suppressHydrationWarning>
                {toISODate(v.createdAt)}
              </span>
            </div>

            <Tabs tabs={tabs} initial={initialTab}>
              {(active) => {
                if (active === "builds") return <VersionBuilds slug={slug} version={v.version} />;
                if (active === "readme") return <Markdown content={v.readme} />;
                if (active === "usage") return <Markdown content={v.usage} />;
                if (active === "preview") {
                  // Use the actual previewUrl from the version data if available
                  // Otherwise fall back to the redirect API endpoint
                  const previewUrl = v.previewUrl || previewApi.getPreviewUrl(slug, v.version);
                  return <PreviewIframe url={previewUrl} />;
                }
                if (active === "code") {
                  return (
                    <div className="p-6 border-2 border-black dark:border-white bg-white dark:bg-black">
                      <span className="text-4xl mb-4 block">💻</span>
                      <a 
                        href={v.codeUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="font-black text-lg text-blue-600 dark:text-blue-400 hover:underline uppercase tracking-wide inline-flex items-center gap-2"
                      >
                        View Code <span className="text-2xl">→</span>
                      </a>
                    </div>
                  );
                }
                return null;
              }}
            </Tabs>
          </li>
        );
      })}
    </ul>
  );
}