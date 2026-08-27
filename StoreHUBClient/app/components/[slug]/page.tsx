// ComponentDetail.tsx
import Link from "next/link";
import { componentApi, versionApi, userApi, githubApi } from "@/lib/api";
import { UserProfileCard } from "@/components/common/user-profile-card";
import { RepositoryInfo } from "@/components/common/repository-info";
import { ComponentDetailTabs } from "@/components/common/component-detail-tabs";
import { OwnerActions } from "@/components/common/owner-actions";
import { InstallCommand } from "@/components/common/install-command";
import { LikeButton } from "@/components/common/like-button";
import { FollowButton } from "@/components/common/follow-button";
import { AddToCollection } from "@/components/common/add-to-collection";
import { ComponentComments } from "@/components/common/component-comments";
import { ComponentRatings } from "@/components/common/component-ratings";
import { RatingStars } from "@/components/common/rating-stars";
import { Badge } from "@/components/common/badge";
import { UserAvatar } from "@/components/common/user-avatar";
import { formatDate } from "@/lib/api-utils";
import { CheckCircle2, Eye, GitBranch, Lock } from "lucide-react";

import type {
  Component,
  ComponentVersion,
  User,
  GitHubRepoInfo,
  GitHubLanguages,
  GitHubLatestCommit,
  GitHubContributor,
} from "@/types";

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

  // Phase 7 — GitHub data enrichment (items 39/41/42/43/44). Public, cached
  // endpoints; best-effort in parallel so a GitHub hiccup never blocks the
  // page — each just falls back to null and its section renders nothing.
  const isLinked = !!(comp.repoLink && comp.repoLink.owner && comp.repoLink.repo);
  let repoInfo: GitHubRepoInfo | null = null;
  let languages: GitHubLanguages | null = null;
  let latestCommit: GitHubLatestCommit | null = null;
  let contributors: GitHubContributor[] | null = null;
  let readme: string | null = null;

  if (isLinked) {
    const owner = comp.repoLink!.owner;
    const repo = comp.repoLink!.repo;
    const ref = comp.repoLink!.ref;
    const [infoResult, langResult, commitResult, contribResult, readmeResult] = await Promise.allSettled([
      githubApi.getRepoInfo({ owner, repo }),
      githubApi.getLanguages({ owner, repo }),
      githubApi.getLatestCommit({ owner, repo, ref }),
      githubApi.getContributors({ owner, repo }),
      githubApi.getReadme({ owner, repo, ref }),
    ]);
    if (infoResult.status === "fulfilled") repoInfo = infoResult.value;
    if (langResult.status === "fulfilled") languages = langResult.value;
    if (commitResult.status === "fulfilled") latestCommit = commitResult.value;
    if (contribResult.status === "fulfilled") contributors = contribResult.value;
    if (readmeResult.status === "fulfilled") readme = readmeResult.value.content;
  }

  const chips = [
    ...(comp.frameworks ?? []).map((v) => ({ value: v, variant: "framework" as const })),
    ...(comp.tags ?? []).map((v) => ({ value: v, variant: "tag" as const })),
  ];

  return (
    <div className="space-y-8">
      {/* ---- Header: everything you need to identify the component ---- */}
      <header className="border-2 border-black dark:border-white bg-white dark:bg-black p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-3 flex-wrap">
              {comp.name}
              {comp.visibility === "private" && (
                <span className="text-xs px-2 py-1 border-2 border-black dark:border-white font-mono font-bold uppercase inline-flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> Private
                </span>
              )}
            </h1>

            {comp.description && (
              <p className="text-sm font-mono text-black/60 dark:text-white/60 leading-relaxed max-w-2xl">
                {comp.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <FollowButton
              componentId={comp.id}
              ownerId={comp.ownerId}
              initialFollowedByMe={comp.followedByMe || false}
            />
            <LikeButton
              slug={comp.slug}
              initialLikeCount={comp.likeCount || 0}
              initialLikedByMe={comp.likedByMe || false}
            />
          </div>
        </div>

        {/* Byline — owner, rating, and the two counts worth seeing up front */}
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-xs font-mono text-black/60 dark:text-white/60">
          {ownerProfile && (
            <Link
              href={`/users/${comp.ownerId}`}
              className="flex items-center gap-2 text-black dark:text-white hover:underline"
            >
              <UserAvatar
                src={ownerProfile.user.avatarUrl}
                name={ownerProfile.user.username || ownerProfile.user.name}
                size="sm"
              />
              <span className="font-bold truncate max-w-[10rem] sm:max-w-[14rem]">
                {ownerProfile.user.username || ownerProfile.user.name}
              </span>
            </Link>
          )}

          {!!comp.ratingCount && (
            <RatingStars rating={comp.averageRating ?? 0} count={comp.ratingCount} size="sm" />
          )}

          <span className="flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5" />
            {versions.length} version{versions.length !== 1 ? "s" : ""}
          </span>

          <span className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            {comp.viewCount || 0} view{comp.viewCount !== 1 ? "s" : ""}
          </span>

          <span>Updated {formatDate(comp.updatedAt)}</span>
        </div>

        {chips.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {chips.map((chip) => (
              <Badge key={`${chip.variant}-${chip.value}`} variant={chip.variant}>
                {chip.value}
              </Badge>
            ))}
          </div>
        )}
      </header>

      {/* ---- Body: content first, supporting detail in a sticky rail ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-10 min-w-0">
          <ComponentDetailTabs component={comp} versions={versions} readme={readme} />
          <ComponentRatings slug={comp.slug} />
          <ComponentComments slug={comp.slug} />
        </div>

        <aside className="space-y-6 min-w-0 lg:sticky lg:top-6 lg:self-start">
          <div className="border-2 border-black dark:border-white bg-white dark:bg-black p-5 sm:p-6 space-y-5">
            <AddToCollection componentId={comp.id} />

            <InstallCommand repoLink={comp.repoLink} />

            {isLinked && (
              <RepositoryInfo
                repoLink={comp.repoLink!}
                repoInfo={repoInfo}
                languages={languages}
                latestCommit={latestCommit}
                contributors={contributors}
              />
            )}

            {/* Facts — the low-frequency metadata, kept out of the way */}
            <dl className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-black/60 dark:text-white/60">License</dt>
                <dd className="font-bold truncate">{comp.license || "None"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-black/60 dark:text-white/60">Repository</dt>
                <dd className="font-bold">
                  {isLinked ? (
                    <span className="text-green-700 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Linked
                    </span>
                  ) : (
                    <span className="text-red-700 dark:text-red-400">Not linked</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-black/60 dark:text-white/60">Created</dt>
                <dd className="font-bold">{formatDate(comp.createdAt)}</dd>
              </div>
            </dl>
          </div>

          {ownerProfile && ownerProfile.components.length > 0 && (
            <div className="border-2 border-black dark:border-white bg-white dark:bg-black p-5 sm:p-6">
              <UserProfileCard
                ownerId={comp.ownerId}
                ownerName={ownerProfile.user.name}
                ownerUsername={ownerProfile.user.username}
                ownerAvatar={ownerProfile.user.avatarUrl}
                otherComponents={ownerProfile.components}
              />
            </div>
          )}

          <OwnerActions
            ownerId={comp.ownerId}
            componentSlug={comp.slug}
            isLinked={isLinked}
            visibility={comp.visibility}
            collaborators={comp.collaborators}
          />
        </aside>
      </div>
    </div>
  );
}
