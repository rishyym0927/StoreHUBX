// ComponentDetail.tsx
import { componentApi, versionApi, userApi } from "@/lib/api";
import { UserProfileCard } from "@/components/common/user-profile-card";
import { ComponentMetadata } from "@/components/common/component-metadata";
import { RepositoryInfo } from "@/components/common/repository-info";
import { ComponentDetailTabs } from "@/components/common/component-detail-tabs";
import { OwnerActions } from "@/components/common/owner-actions";
import { InstallCommand } from "@/components/common/install-command";
import { LikeButton } from "@/components/common/like-button";
import { ComponentComments } from "@/components/common/component-comments";
import { ComponentRatings } from "@/components/common/component-ratings";
import { RatingStars } from "@/components/common/rating-stars";
import { Badge } from "@/components/common/badge";
import { CheckCircle2 } from "lucide-react";

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
          <div className="lg:col-span-1 space-y-6 min-w-0">
            {/* Component Title and Description */}
            <div className="space-y-4">
              <div className="border-b-2 border-black dark:border-white pb-4 flex items-start justify-between">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-3 flex-wrap">
                  {comp.name}
                  {comp.visibility === "private" && (
                    <span className="text-xs px-2 py-1 border-2 border-black dark:border-white font-mono font-bold uppercase align-middle">
                      Private
                    </span>
                  )}
                </h1>
                <LikeButton 
                   slug={comp.slug} 
                   initialLikeCount={comp.likeCount || 0} 
                   initialLikedBy={comp.likedBy || []} 
                />
              </div>
              
              {comp.description && (
                <p className="text-sm font-mono text-black/60 dark:text-white/60 leading-relaxed">
                  {comp.description}
                </p>
              )}

              {!!comp.ratingCount && (
                <RatingStars rating={comp.averageRating ?? 0} count={comp.ratingCount} size="md" />
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
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 border border-black dark:border-white bg-black/5 dark:bg-white/5 overflow-hidden">
                  <div className="text-xl sm:text-2xl font-bold font-mono truncate">{versions.length}</div>
                  <div className="text-[10px] sm:text-xs font-mono text-black/60 dark:text-white/60 mt-1 truncate">
                    Version{versions.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="text-center p-2 border border-black dark:border-white bg-black/5 dark:bg-white/5 overflow-hidden">
                  <div className="text-xl sm:text-2xl font-bold font-mono truncate">
                    {comp.frameworks?.length || 0}
                  </div>
                  <div className="text-[10px] sm:text-xs font-mono text-black/60 dark:text-white/60 mt-1 truncate">
                    Frameworks
                  </div>
                </div>
                <div className="text-center p-2 border border-black dark:border-white bg-black/5 dark:bg-white/5 overflow-hidden">
                  <div className="text-xl sm:text-2xl font-bold font-mono truncate">
                    {comp.viewCount || 0}
                  </div>
                  <div className="text-[10px] sm:text-xs font-mono text-black/60 dark:text-white/60 mt-1 truncate">
                    Views
                  </div>
                </div>
              </div>
            </div>

            {/* Clone Repository Command */}
            <InstallCommand repoLink={comp.repoLink} />

            {/* Owner Actions (only visible to owner) */}
            <div className="pt-4 border-t-2 border-black dark:border-white">
              <OwnerActions
                ownerId={comp.ownerId}
                componentSlug={comp.slug}
                isLinked={!!(comp.repoLink && comp.repoLink.owner && comp.repoLink.repo)}
                visibility={comp.visibility}
                collaborators={comp.collaborators}
              />
            </div>
          </div>

          {/* Right Column - Tabs with Versions, Preview & Builds */}
          <div className="lg:col-span-3 space-y-8 min-w-0">
            {/* Component Details Card */}
            <div className="border-2 border-black dark:border-white p-6 bg-white dark:bg-black">
              <h2 className="text-xl font-bold mb-4 pb-3 border-b border-black dark:border-white">
                Component Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Details Column */}
                <div className="space-y-4 min-w-0">
                  {/* Frameworks */}
                  {comp.frameworks && comp.frameworks.length > 0 && (
                    <div>
                      <div className="text-xs font-mono text-black/60 dark:text-white/60 mb-2 uppercase tracking-wider">
                        Frameworks
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {comp.frameworks.map((fw) => (
                          <Badge key={fw} variant="framework">{fw}</Badge>
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
                          <Badge key={tag} variant="tag">{tag}</Badge>
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
                        <span className="font-mono font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Linked
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
                <div className="space-y-4 min-w-0">
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

            {/* Reviews Section */}
            <ComponentRatings slug={comp.slug} />

            {/* Discussions Section */}
            <ComponentComments slug={comp.slug} />
          </div>
        </div>
      </div>
    </div>
  );
}
