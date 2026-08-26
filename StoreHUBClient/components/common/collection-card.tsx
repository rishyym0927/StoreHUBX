"use client";

import Link from "next/link";
import { FolderOpen } from "lucide-react";
import type { Collection } from "@/types";
import { formatRelativeTime } from "@/lib/api-utils";

interface CollectionCardProps {
  collection: Collection;
}

/**
 * Card for the public collections discovery grid. Mirrors ComponentCard's
 * visual weight (border-2, brutal-lift, same footer treatment) but shows
 * only what a collection has to offer: name, description, size, recency.
 */
export function CollectionCard({ collection }: CollectionCardProps) {
  const count = collection.componentIds?.length ?? 0;

  return (
    <Link
      href={`/collections/${collection.id}`}
      className="brutal-lift group border-2 border-black dark:border-white h-full flex flex-col"
    >
      <div className="p-5 space-y-3 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight group-hover:underline decoration-2 truncate">
              {collection.name}
            </h3>
            {collection.description && (
              <p className="text-xs font-mono text-black/70 dark:text-white/70 leading-relaxed line-clamp-2 mt-1.5">
                {collection.description}
              </p>
            )}
          </div>
          <FolderOpen className="w-5 h-5 shrink-0 text-black/40 dark:text-white/40" />
        </div>

        <div className="mt-auto pt-3 border-t border-black/20 dark:border-white/20 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-mono">
          <span>
            {count} component{count !== 1 ? "s" : ""}
          </span>
          {collection.updatedAt && (
            <span className="text-black/60 dark:text-white/60">
              {formatRelativeTime(collection.updatedAt)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
