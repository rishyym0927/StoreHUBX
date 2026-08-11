"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Component } from "@/types";
import { RatingStars } from "@/components/common/rating-stars";
import { Badge } from "@/components/common/badge";
import { RepoStatsBadge } from "@/components/common/repo-stats-badge";
import { useAuth } from "@/lib/store";
import { componentApi } from "@/lib/api";
import { Trash2 } from "lucide-react";

interface ComponentCardProps {
  component: Component;
  showOwnerActions?: boolean;
  currentUserId?: string;
  /** Called after a successful delete so the parent list can drop this card. */
  onDeleted?: (slug: string) => void;
}

export function ComponentCard({
  component,
  showOwnerActions = false,
  currentUserId,
  onDeleted,
}: ComponentCardProps) {
  const token = useAuth((s) => s.token);
  const isLinked = component.repoLink?.owner && component.repoLink?.repo;
  const isOwner = currentUserId && currentUserId === component.ownerId;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await componentApi.delete(component.slug, token);
      onDeleted?.(component.slug);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
      setConfirmingDelete(false);
      setDeleting(false);
    }
  };

  return (
    <div className="brutal-lift brutal-lift-lg group border-2 border-black dark:border-white">
      <div className="p-6 space-y-4">
        {/* Header Section */}
        <div className="flex items-start justify-between gap-4">
          <Link
            href={`/components/${component.slug}`}
            className="flex-1 min-w-0"
          >
            <h3 className="text-xl sm:text-2xl font-bold mb-2 tracking-tight group-hover:underline decoration-2">
              {component.name}
            </h3>
            {component.description && (
              <p className="text-sm font-mono text-black/70 dark:text-white/70 leading-relaxed line-clamp-2">
                {component.description}
              </p>
            )}
          </Link>

          {/* Status Badge */}
          <div className="shrink-0 flex items-center gap-2">
            {component.visibility === "private" && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 border border-black dark:border-white">
                <span className="text-xs font-mono font-bold">PRIVATE</span>
              </div>
            )}
            {isLinked ? (
              <>
                <RepoStatsBadge owner={component.repoLink!.owner} repo={component.repoLink!.repo} />
                <div className="flex items-center gap-1.5 px-3 py-1.5 border border-black dark:border-white bg-green-50 dark:bg-green-950">
                  <span className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full"></span>
                  <span className="text-xs font-mono font-bold text-green-600 dark:text-green-400">
                    LINKED
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 border border-black dark:border-white bg-red-50 dark:bg-red-950">
                <span className="w-2 h-2 bg-red-600 dark:bg-red-400 rounded-full"></span>
                <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">
                  UNLINKED
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Frameworks Section */}
        {component.frameworks && component.frameworks.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-black/20 dark:border-white/20">
            {component.frameworks.map((fw) => (
              <Badge key={fw} variant="framework">{fw}</Badge>
            ))}
          </div>
        )}

        {/* Tags Section */}
        {component.tags && component.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {component.tags.slice(0, 6).map((tag) => (
              <Badge key={tag} variant="tag">{tag}</Badge>
            ))}
            {component.tags.length > 6 && (
              <span className="text-xs font-mono text-black/40 dark:text-white/40">
                +{component.tags.length - 6} more
              </span>
            )}
          </div>
        )}

        {/* Footer Section */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 border-t border-black/20 dark:border-white/20 text-xs font-mono">
          {/* License */}
          {component.license && (
            <div className="flex items-center gap-1.5">
              <span className="text-black/60 dark:text-white/60">License:</span>
              <span className="font-bold">{component.license}</span>
            </div>
          )}

          {/* Created Date */}
          {component.createdAt && (
            <div className="flex items-center gap-1.5">
              <span className="text-black/60 dark:text-white/60">Created:</span>
              <span className="font-bold">
                {new Date(component.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          )}

          {/* Repository Info */}
          {isLinked && (
            <a
              href={`https://github.com/${component.repoLink?.owner}/${component.repoLink?.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 w-full sm:w-auto min-w-0 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span className="font-bold hover:underline truncate">
                {component.repoLink?.owner}/{component.repoLink?.repo}
              </span>
            </a>
          )}

          {/* Branch/Ref & Commit SHA — secondary technical detail, hidden on the
              narrowest viewports so the primary chips (license/dates/rating) stay legible */}
          {component.repoLink?.ref && (
            <div className="hidden sm:flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              <span className="font-bold">{component.repoLink.ref}</span>
            </div>
          )}

          {component.repoLink?.commit && (
            <div className="hidden sm:flex items-center gap-1.5 font-mono">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-bold">{component.repoLink.commit.substring(0, 7)}</span>
            </div>
          )}

          {/* Rating */}
          {!!component.ratingCount && (
            <RatingStars rating={component.averageRating ?? 0} count={component.ratingCount} />
          )}

          {/* Updated Date */}
          {component.updatedAt && component.updatedAt !== component.createdAt && (
            <div className="flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-black/60 dark:text-white/60">Updated:</span>
              <span className="font-bold">
                {new Date(component.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          )}

          {/* Owner Actions */}
          {showOwnerActions && isOwner && (
            <>
              <div className="w-full border-t border-black/20 dark:border-white/20 my-2"></div>
              <div className="flex gap-2 w-full">
                <Link
                  href={`/components/${component.slug}/import`}
                  className="flex-1 text-center px-3 py-1.5 border-2 border-black dark:border-white font-mono text-xs font-bold transition-all hover:bg-blue-600 hover:text-white hover:border-blue-600 dark:hover:bg-blue-500 dark:hover:border-blue-500"
                  onClick={(e) => e.stopPropagation()}
                >
                  Link Repo
                </Link>
                <Link
                  href={`/components/${component.slug}/new-version`}
                  className="flex-1 text-center px-3 py-1.5 border-2 border-black dark:border-white font-mono text-xs font-bold transition-all hover:bg-purple-600 hover:text-white hover:border-purple-600 dark:hover:bg-purple-500 dark:hover:border-purple-500"
                  onClick={(e) => e.stopPropagation()}
                >
                  Add Version
                </Link>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 border-2 font-mono text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    confirmingDelete
                      ? "border-red-600 dark:border-red-400 bg-red-600 dark:bg-red-500 text-white"
                      : "border-black dark:border-white hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-500 dark:hover:border-red-500"
                  }`}
                  title={confirmingDelete ? "Click again to confirm" : "Delete component"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmingDelete && "Confirm?"}
                </button>
              </div>
              {deleteError && (
                <p className="text-xs font-mono text-red-600 dark:text-red-400 w-full">{deleteError}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
