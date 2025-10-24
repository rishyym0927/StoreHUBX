import { componentApi, versionApi } from "@/lib/api";
import { formatDate } from "@/lib/api-utils";
import { VersionsList, VersionDoc } from "@/components/common/version-list";
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
    <div className="space-y-10 max-w-7xl mx-auto">
      {/* Hero Section - Bold Black & White Design */}
      <section className="relative border-1 border-black dark:border-white p-8 bg-white dark:bg-black">
        <div className="space-y-6">
          <a
            href={`/components/${slug}/import`}
            className="inline-flex items-center gap-3 px-5 py-3 border-1 border-black dark:border-white bg-white dark:bg-black hover:scale-105 transition-transform duration-200 font-bold group"
          >
            <span className="text-2xl group-hover:scale-125 transition-transform">🔗</span>
            <span className="uppercase tracking-wide text-sm">Link GitHub Repository</span>
          </a>

          <div>
            <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight text-black dark:text-white  leading-tight">
              {comp.name}
            </h1>
            <p className="text-lg font-bold text-black dark:text-white leading-relaxed max-w-3xl border-l-4 border-black dark:border-white pl-4">
              {comp.description}
            </p>
          </div>
          
          {/* Framework Badges - Bold with Colored Borders */}
          <div className="flex items-center gap-3 flex-wrap">
            {(comp.frameworks ?? []).map((fw, idx) => {
              const colors = [
                'border-blue-600 text-blue-600',
                'border-purple-600 text-purple-600',
                'border-green-600 text-green-600',
                'border-red-600 text-red-600',
                'border-yellow-600 text-yellow-600',
                'border-pink-600 text-pink-600',
              ];
              const colorClass = colors[idx % colors.length];
              return (
                <span 
                  key={fw} 
                  className={`px-5 py-2.5 border-1 ${colorClass} bg-white dark:bg-black font-black uppercase tracking-wide text-sm hover:scale-105 transition-transform cursor-default`}
                >
                  {fw}
                </span>
              );
            })}
          </div>
          
          {/* Metadata Section - Bold Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4  border-black dark:border-white">
            <div className="flex items-center gap-3 p-4 border-1 border-black dark:border-white bg-white dark:bg-black">
              <span className="text-3xl">📄</span>
              <div>
                <div className="text-xs font-black uppercase opacity-60">License</div>
                <div className="font-black text-sm">{comp.license ?? "No License"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 border-1 border-black dark:border-white bg-white dark:bg-black">
              <span className="text-3xl">📅</span>
              <div>
                <div className="text-xs font-black uppercase opacity-60">Created</div>
                <div className="font-black text-sm">{createdDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 border-1 border-black dark:border-white bg-white dark:bg-black">
              {comp.repoLink && comp.repoLink.owner && comp.repoLink.repo ? (
                <>
                  <span className="text-3xl">✅</span>
                  <div>
                    <div className="text-xs font-black uppercase text-green-600">Status</div>
                    <div className="font-black text-sm text-green-600">GitHub Linked</div>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-3xl">❌</span>
                  <div>
                    <div className="text-xs font-black uppercase text-red-600">Status</div>
                    <div className="font-black text-sm text-red-600">Not Linked</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Versions Section - Bold Layout */}
      <section>
        <div className="flex items-center justify-between  pb-4 border-black dark:border-white">
          <div>
            <h2 className="text-4xl font-black uppercase tracking-tight text-black dark:text-white">Versions</h2>
            <p className="text-sm font-bold opacity-70 mt-1 uppercase tracking-wide">Browse and manage component versions</p>
          </div>
          <a
            href={`/components/${slug}/new-version`}
            className="group inline-flex items-center gap-3 px-6 py-3 bg-black dark:bg-white text-white dark:text-black border-1 border-black dark:border-white font-black uppercase text-sm tracking-wide transition-transform duration-200 hover:scale-105"
          >
            <span className="text-2xl group-hover:rotate-90 transition-transform duration-200">➕</span>
            <span>Add Version</span>
          </a>
        </div>

        {/* Client wrapper handles tabs/render functions on client */}
        <VersionsList slug={slug} versions={versions ?? []} />
      </section>
    </div>
  );
}
