// ComponentDetail.tsx
import { componentApi, versionApi, userApi } from "@/lib/api";
import { UserProfileCard } from "@/components/common/user-profile-card";
import { ComponentMetadata } from "@/components/common/component-metadata";
import { RepositoryInfo } from "@/components/common/repository-info";
import { ComponentDetailTabs } from "@/components/common/component-detail-tabs";
import { OwnerActions } from "@/components/common/owner-actions";
import { InstallCommand } from "@/components/common/install-command";

import type { Component, ComponentVersion, User } from "@/types";

export default async function ComponentDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  
  // Fetch component data with error handling
  let comp: Component;
  let versions: ComponentVersion[] = [];
  let ownerProfile: { user: User; components: Component[] } | null = null;
  
  try {
    comp = await componentApi.get(slug);
    console.log("Fetched component:", comp);
  } catch (error) {
    console.error("Failed to fetch component:", error);
    throw error; // Let Next.js error boundary handle it
  }

  try {
    const fetchedVersions = await versionApi.list(slug);
    versions = fetchedVersions || [];
  } catch (error) {
    console.error("Failed to fetch versions:", error);
    // Continue with empty versions array instead of crashing
    versions = [];
  }

  // Fetch owner's profile and their other components
  try {
    const profile = await userApi.getProfileById(comp.ownerId);
    ownerProfile = {
      user: profile.user,
      components: profile.components.filter(c => c.slug !== slug), // Exclude current component
    };
  } catch (error) {
    console.error("Failed to fetch owner profile:", error);
    // Continue without owner profile
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 sm:gap-12">
          {/* Left Column - User & Component Info */}
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

            {/* Owner Profile Card */}
            {ownerProfile && (
              <UserProfileCard
                ownerId={comp.ownerId}
                ownerName={ownerProfile.user.name}
                ownerUsername={ownerProfile.user.username}
                ownerAvatar={ownerProfile.user.avatarUrl}
                otherComponents={ownerProfile.components}
              />
            )}

            {/* Quick Stats */}
            <div className="pb-4 border-b border-black dark:border-white">
              <div className="text-xs font-mono text-black/60 dark:text-white/60 mb-3 uppercase tracking-wider">
                Quick Stats
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 border border-black dark:border-white bg-black/5 dark:bg-white/5">
                  <div className="text-2xl font-bold font-mono">{versions.length}</div>
                  <div className="text-xs font-mono text-black/60 dark:text-white/60 mt-1">
                    Version{versions.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="text-center p-3 border border-black dark:border-white bg-black/5 dark:bg-white/5">
                  <div className="text-2xl font-bold font-mono">
                    {comp.frameworks?.length || 0}
                  </div>
                  <div className="text-xs font-mono text-black/60 dark:text-white/60 mt-1">
                    Framework{comp.frameworks?.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </div>

            {/* Install Command */}
            {versions.length > 0 && (
              <InstallCommand 
                componentSlug={comp.slug} 
                version={versions[0]?.version}
              />
            )}

            {/* Owner Actions (only visible to owner) */}
            <div className="pt-4 border-t-2 border-black dark:border-white">
              <OwnerActions 
                ownerId={comp.ownerId}
                componentSlug={comp.slug}
                isLinked={!!(comp.repoLink && comp.repoLink.owner && comp.repoLink.repo)}
              />
            </div>
          </div>

          {/* Right Column - Tabs with Versions, Preview & Builds */}
          <div className="lg:col-span-3 space-y-8">
            {/* Component Details Card */}
            <div className="border-2 border-black dark:border-white p-6 bg-white dark:bg-black">
              <h2 className="text-xl font-bold mb-4 pb-3 border-b border-black dark:border-white">
                Component Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Details Column */}
                <div className="space-y-4">
                  {/* Frameworks */}
                  {comp.frameworks && comp.frameworks.length > 0 && (
                    <div>
                      <div className="text-xs font-mono text-black/60 dark:text-white/60 mb-2 uppercase tracking-wider">
                        Frameworks
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {comp.frameworks.map((fw) => (
                          <span
                            key={fw}
                            className="px-2 py-1 border border-black dark:border-white text-xs font-mono bg-white dark:bg-black"
                          >
                            {fw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {comp.tags && comp.tags.length > 0 && (
                    <div>
                      <div className="text-xs font-mono text-black/60 dark:text-white/60 mb-2 uppercase tracking-wider">
                        Tags
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {comp.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-black text-white dark:bg-white dark:text-black text-xs font-mono"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* License & Status */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-black/60 dark:text-white/60">License</span>
                      <span className="font-mono font-bold">{comp.license || "None"}</span>
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
                </div>

                {/* Right Details Column */}
                <div className="space-y-4">
                  {/* Repository Info */}
                  {comp.repoLink && comp.repoLink.owner && comp.repoLink.repo && (
                    <RepositoryInfo repoLink={comp.repoLink} />
                  )}

                  {/* Dates */}
                  <div className="space-y-2 pt-4 border-t border-black/20 dark:border-white/20">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-black/60 dark:text-white/60">Created</span>
                      <span className="font-mono font-bold">
                        {new Date(comp.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-black/60 dark:text-white/60">Updated</span>
                      <span className="font-mono font-bold">
                        {new Date(comp.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Section */}
            <ComponentDetailTabs component={comp} versions={versions} />
          </div>
        </div>
      </div>
    </div>
  );
}
