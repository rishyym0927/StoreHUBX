"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FolderOpen, Lock, Plus } from "lucide-react";
import { useAuth } from "@/lib/store";
import { collectionApi } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { useToast } from "@/components/common/toast";
import { formatDate } from "@/lib/api-utils";
import type { Collection } from "@/types";

interface CollectionListProps {
  /** providerId of the profile being viewed */
  ownerId: string;
  /** Show the create form — only on the viewer's own profile. */
  canCreate?: boolean;
}

export function CollectionList({ ownerId, canCreate = false }: CollectionListProps) {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError(null);
    try {
      setCollections(await collectionApi.listForUser(ownerId, token ?? undefined));
    } catch (err) {
      console.error("Failed to load collections:", err);
      setError(err instanceof Error ? err.message : "Failed to load collections");
    } finally {
      setLoading(false);
    }
  }, [ownerId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !name.trim()) return;
    setCreating(true);
    try {
      const collection = await collectionApi.create({ name: name.trim() }, token);
      setCollections((prev) => [collection, ...prev]);
      setName("");
      showToast("Collection created.", "success");
    } catch (err) {
      console.error("Failed to create collection:", err);
      showToast("Failed to create collection. Please try again.", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {canCreate && (
        <form onSubmit={create} className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New collection name"
            className="min-w-0 flex-1 px-3 py-2.5 text-sm font-mono border-2 border-black dark:border-white bg-transparent focus:outline-none"
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="shrink-0 flex items-center gap-1.5 border-2 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
        </form>
      )}

      {loading ? (
        <p className="font-mono text-sm animate-pulse">Loading collections…</p>
      ) : error ? (
        <p className="font-mono text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : collections.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No Collections"
          description={
            canCreate
              ? "Group components you want to come back to."
              : "This user hasn't published any collections."
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/collections/${collection.id}`}
              className="brutal-lift block border-2 border-black dark:border-white bg-white dark:bg-black p-5 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-lg truncate">{collection.name}</h3>
                {collection.visibility === "private" && (
                  <Lock className="w-3.5 h-3.5 shrink-0 mt-1.5" aria-label="Private" />
                )}
              </div>
              {collection.description && (
                <p className="text-xs font-mono text-black/60 dark:text-white/60 line-clamp-2">
                  {collection.description}
                </p>
              )}
              <p className="text-xs font-mono text-black/60 dark:text-white/60">
                {collection.componentIds?.length ?? 0} component
                {(collection.componentIds?.length ?? 0) !== 1 ? "s" : ""} · {formatDate(collection.createdAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
