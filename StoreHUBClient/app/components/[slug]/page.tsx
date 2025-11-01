// ComponentDetail.tsx
import { componentApi, versionApi } from "@/lib/api";
import { formatDate } from "@/lib/api-utils";
import { VersionsDisplay } from "@/components/common/version-list";
import { AutoDeploy } from "@/components/common/auto-deploy";
import type { Component, ComponentVersion } from "@/types";

export default async function ComponentDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const comp = await componentApi.get(slug);
  const versions = await versionApi.list(slug);

  // Format creation date consistently (server-safe)
  const createdDate = comp.createdAt 
    ? formatDate(comp.createdAt)
    : "—";

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 sm:gap-12">
          {/* Left Column - Component Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Component Title and Description */}
            <div className="space-y-4">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight border-b-2 border-black dark:border-white pb-4">
                {comp.name}
              </h1>
              
              {comp.description && (
                <p className="text-sm font-mono text-black/60 dark:text-white/60 leading-relaxed">
                  {comp.description}
                </p>
              )}
            </div>

            {/* Framework Badges */}
            {comp.frameworks && comp.frameworks.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pb-4 border-b border-black dark:border-white">
                {comp.frameworks.map((fw) => (
                  <span 
                    key={fw} 
                    className="px-2 py-1 border border-black dark:border-white text-xs font-mono"
                  >
                    {fw}
                  </span>
                ))}
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-3 pb-4 border-b border-black dark:border-white">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-black/60 dark:text-white/60">License</span>
                <span className="font-mono font-bold">{comp.license ?? "None"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-black/60 dark:text-white/60">Created</span>
                <span className="font-mono font-bold">{createdDate}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-black/60 dark:text-white/60">Status</span>
                {comp.repoLink && comp.repoLink.owner && comp.repoLink.repo ? (
                  <span className="font-mono font-bold text-green-600 dark:text-green-400">
                    ✓ Linked
                  </span>
                ) : (
                  <span className="font-mono font-bold text-red-600 dark:text-red-400">
                    Not Linked
                  </span>
                )}
              </div>
            </div>

            {/* GitHub Repository Info */}
            {comp.repoLink && comp.repoLink.owner && comp.repoLink.repo && (
              <div className="space-y-2 pb-4 border-b border-black dark:border-white">
                <div className="text-xs font-mono text-black/60 dark:text-white/60">
                  Repository
                </div>
                <div className="font-mono text-xs break-all">
                  <a 
                    href={`https://github.com/${comp.repoLink.owner}/${comp.repoLink.repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {comp.repoLink.owner}/{comp.repoLink.repo}
                  </a>
                  {comp.repoLink.path && (
                    <span className="text-black/60 dark:text-white/60"> / {comp.repoLink.path}</span>
                  )}
                </div>
                <div className="text-xs font-mono text-black/60 dark:text-white/60">
                  Branch: {comp.repoLink.ref || "main"}
                </div>
              </div>
            )}

            {/* Action Button */}
            <div>
              <a
                href={`/components/${slug}/import`}
                className="block w-full text-center border-2 border-black dark:border-white px-4 py-3 text-sm font-mono transition-transform hover:scale-105 active:scale-95"
              >
                {comp.repoLink?.owner ? "Change Repository" : "Link GitHub"}
              </a>
            </div>
          </div>

          {/* Right Column - Preview and Versions */}
          <div className="lg:col-span-2 space-y-8">
            {/* Auto-Deploy Section (only for linked repos) */}
            {comp.repoLink && comp.repoLink.owner && comp.repoLink.repo && (
              <section>
                <AutoDeploy component={comp} versions={versions ?? []} />
              </section>
            )}

            {/* Versions Section */}
            <section className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b-2 border-black dark:border-white">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-1">
                    Versions
                  </h2>
                  <p className="text-xs font-mono text-black/60 dark:text-white/60">
                    {versions && versions.length > 0 ? `${versions.length} version${versions.length > 1 ? 's' : ''} available` : 'No versions yet'}
                  </p>
                </div>
              </div>

              {/* Versions Display */}
              <VersionsDisplay slug={slug} versions={versions ?? []} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
