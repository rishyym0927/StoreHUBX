"use client";

import Link from "next/link";
import { useState } from "react";
import type { Component } from "@/types";
import { RatingStars } from "@/components/common/rating-stars";
import { Badge } from "@/components/common/badge";
import { RepoStatsBadge } from "@/components/common/repo-stats-badge";
import { useAuth } from "@/lib/store";
import { componentApi } from "@/lib/api";
import { formatRelativeTime } from "@/lib/api-utils";
import { useConfirmDelete } from "@/hooks/use-confirm-delete";
import { Lock, Trash2 } from "lucide-react";

interface ComponentCardProps {
  component: Component;
  showOwnerActions?: boolean;
  currentUserId?: string;
  /** Called after a successful delete so the parent list can drop this card. */
  onDeleted?: (slug: string) => void;
}

/**
 * The card used on every list surface (home, browse, /me, /users/[id],
 * /collections/[id]). It deliberately shows only what someone scanning a
 * list decides on — name, what it is, stack, rating, recency. License,
 * created date, git ref and commit SHA all live on the component page,
 * which shows them in its rail; repeating them here just made the card
 * tall enough that only two fit on screen.
 */
export function ComponentCard({
  component,
  showOwnerActions = false,
  currentUserId,
  onDeleted,
}: ComponentCardProps) {
  const token = useAuth((s) => s.token);
  const isLinked = !!(component.repoLink?.owner && component.repoLink?.repo);
  const isOwner = currentUserId && currentUserId === component.ownerId;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { confirming: confirmingDelete, pending: deleting, trigger } = useConfirmDelete(async () => {
    if (!token) return;
    setDeleteError(null);
    try {
      await componentApi.delete(component.slug, token);
      onDeleted?.(component.slug);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    }
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token) return;
    trigger();
  };

  const chips = [
    ...(component.frameworks ?? []).map((v) => ({ value: v, variant: "framework" as const })),
    ...(component.tags ?? []).slice(0, 4).map((v) => ({ value: v, variant: "tag" as const })),
  ];
  const hiddenTagCount = Math.max(0, (component.tags?.length ?? 0) - 4);

  return (
    <div className="brutal-lift group border-2 border-black dark:border-white h-full flex flex-col">
      <div className="p-5 space-y-3 flex-1 flex flex-col">
        {/* Title + description — the whole block is the link target */}
        <div className="flex items-start justify-between gap-3">
          <Link href={`/components/${component.slug}`} className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight group-hover:underline decoration-2 truncate">
              {component.name}
            </h3>
            {component.description && (
              <p className="text-xs font-mono text-black/70 dark:text-white/70 leading-relaxed line-clamp-2 mt-1.5">
                {component.description}
              </p>
            )}
          </Link>

          {component.visibility === "private" && (
            <span
              title="Private"
              className="shrink-0 flex items-center gap-1 px-2 py-1 border border-black dark:border-white text-[10px] font-mono font-bold"
            >
              <Lock className="w-3 h-3" /> PRIVATE
            </span>
          )}
        </div>

        {/* Stack */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Badge key={`${chip.variant}-${chip.value}`} variant={chip.variant}>
                {chip.value}
              </Badge>
            ))}
            {hiddenTagCount > 0 && (
              <span className="text-[10px] font-mono text-black/40 dark:text-white/40 self-center">
                +{hiddenTagCount}
              </span>
            )}
          </div>
        )}

        {/* Footer — rating, recency, and the repo (which is also the
            "is it linked" signal, so no separate LINKED badge is needed) */}
        <div className="mt-auto pt-3 border-t border-black/20 dark:border-white/20 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-mono">
          {!!component.ratingCount && (
            <RatingStars rating={component.averageRating ?? 0} count={component.ratingCount} />
          )}

          {component.updatedAt && (
            <span className="text-black/60 dark:text-white/60">
              {formatRelativeTime(component.updatedAt)}
            </span>
          )}

          {isLinked && (
            <>
              <RepoStatsBadge owner={component.repoLink!.owner} repo={component.repoLink!.repo} />
              <a
                href={`https://github.com/${component.repoLink!.owner}/${component.repoLink!.repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 min-w-0 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span className="truncate">{component.repoLink!.repo}</span>
              </a>
            </>
          )}
        </div>

        {/* Owner actions — monochrome, matching every other control in the
            system; only the destructive one carries colour. */}
        {showOwnerActions && isOwner && (
          <div className="pt-3 border-t border-black/20 dark:border-white/20 space-y-2">
            <div className="flex gap-2">
              <Link
                href={`/components/${component.slug}/import`}
                className="flex-1 text-center px-3 py-1.5 border-2 border-black dark:border-white font-mono text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {isLinked ? "Repo" : "Link Repo"}
              </Link>
              <Link
                href={`/components/${component.slug}/new-version`}
                className="flex-1 text-center px-3 py-1.5 border-2 border-black dark:border-white font-mono text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Add Version
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 border-2 font-mono text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  confirmingDelete
                    ? "border-red-700 dark:border-red-400 bg-red-700 dark:bg-red-500 text-white"
                    : "border-black dark:border-white hover:bg-red-700 hover:text-white hover:border-red-700 dark:hover:bg-red-500 dark:hover:border-red-500"
                }`}
                title={confirmingDelete ? "Click again to confirm" : "Delete component"}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmingDelete && "Confirm?"}
              </button>
            </div>
            {deleteError && (
              <p className="text-xs font-mono text-red-700 dark:text-red-400">{deleteError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
