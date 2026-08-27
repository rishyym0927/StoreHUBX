"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs } from "@/components/common/tabs";
import { PreviewIframe } from "@/components/common/preview-iframe";
import { Markdown } from "@/components/common/markdown";
import { VersionBuilds } from "@/components/common/version-builds";
import { previewApi } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { formatDate } from "@/lib/api-utils";

// Renders the Preview tab for a version. Anonymous viewers, and any
// logged-in viewer who isn't the owner/collaborator (the common case for a
// PUBLIC component — the backend would reject their token request with
// 403/404 anyway), get the plain unsigned preview URL exactly as before, no
// extra request, no added latency, no spinner flash. Only an owner/
// collaborator fetches a short-lived signed token first, since they're the
// only ones who need it to pass identity through the iframe src (which
// can't carry an Authorization header) for a private component's preview.
// If the token fetch still fails (e.g. a transient error), fall back to the
// plain unsigned URL — worst case it 404s the same way it does today.
function VersionPreviewTab({
  slug,
  version,
  ownerId,
  collaborators,
}: {
  slug: string;
  version: string;
  ownerId?: string;
  collaborators?: string[];
}) {
  const { token: authToken, user } = useAuth();
  const baseUrl = previewApi.getPreviewUrl(slug, version);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Mirrors the backend's own check (owner or collaborator) — see
  // version-builds.tsx for the same ownerId/providerId comparison pattern.
  const isOwner = !!(
    user &&
    ownerId &&
    (user.providerId === ownerId || collaborators?.includes(user.providerId))
  );
  const shouldFetchToken = !!authToken && isOwner;
  const [isLoadingToken, setIsLoadingToken] = useState(shouldFetchToken);

  useEffect(() => {
    if (!shouldFetchToken) {
      setSignedUrl(null);
      setIsLoadingToken(false);
      return;
    }

    let cancelled = false;
    setIsLoadingToken(true);
    previewApi
      .getPreviewToken(slug, version, authToken as string)
      .then(({ token }) => {
        if (!cancelled) setSignedUrl(`${baseUrl}?token=${encodeURIComponent(token)}`);
      })
      .catch(() => {
        // Transient error — fall back to the plain URL rather than
        // blocking the preview entirely.
        if (!cancelled) setSignedUrl(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingToken(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, version, authToken, shouldFetchToken, baseUrl]);

  if (isLoadingToken) {
    return (
      <div className="border-2 border-black dark:border-white p-8 text-center bg-black/5 dark:bg-white/5">
        <Loader2 className="w-6 h-6 mb-3 mx-auto animate-spin" />
        <p className="font-mono text-sm text-black/60 dark:text-white/60">
          Preparing preview...
        </p>
      </div>
    );
  }

  return <PreviewIframe url={signedUrl || baseUrl} />;
}

export type VersionDoc = {
  version: string;
  changelog?: string;
  readme?: string;
  usage?: string;
  codeUrl?: string;
  commitSha?: string;
  createdAt: string;
};

// Main component that shows latest version with a selector for other versions
export function VersionsDisplay({
  slug,
  versions,
  ownerId,
  collaborators,
}: {
  slug: string;
  versions: VersionDoc[];
  ownerId?: string;
  collaborators?: string[];
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
      <VersionsList slug={slug} versions={[currentVersion]} ownerId={ownerId} collaborators={collaborators} />
    </div>
  );
}

export function VersionsList({
  slug,
  versions,
  ownerId,
  collaborators,
}: {
  slug: string;
  versions: VersionDoc[];
  ownerId?: string;
  collaborators?: string[];
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
                {v.createdAt ? formatDate(v.createdAt) : ""}
              </span>
            </div>

            {/* Tabs Content */}
            <div className="p-4 sm:p-6">
              <Tabs tabs={tabs} initial={initialTab}>
                {(active) => {
                  if (active === "builds") return <VersionBuilds slug={slug} version={v.version} ownerId={ownerId} collaborators={collaborators} />;
                  if (active === "readme") return <Markdown content={v.readme} />;
                  if (active === "usage") return <Markdown content={v.usage} />;
                  if (active === "preview") {
                    return (
                      <VersionPreviewTab
                        slug={slug}
                        version={v.version}
                        ownerId={ownerId}
                        collaborators={collaborators}
                      />
                    );
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