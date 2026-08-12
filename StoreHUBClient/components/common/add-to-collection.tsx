"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FolderPlus, Plus } from "lucide-react";
import { useAuth } from "@/lib/store";
import { collectionApi } from "@/lib/api";
import { useToast } from "@/components/common/toast";
import type { Collection } from "@/types";

interface AddToCollectionProps {
  componentId: string;
}

export function AddToCollection({ componentId }: AddToCollectionProps) {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // Collections are keyed by providerId — the same value as the JWT's
  // user_id claim and Component.ownerId.
  const ownerId = user?.providerId || user?.id;

  const load = useCallback(async () => {
    if (!token || !ownerId) return;
    setLoading(true);
    try {
      setCollections(await collectionApi.listForUser(ownerId, token));
    } catch (error) {
      console.error("Failed to load collections:", error);
      showToast("Failed to load your collections.", "error");
    } finally {
      setLoading(false);
    }
  }, [token, ownerId, showToast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!token || !user) return null;

  const toggle = async (collection: Collection) => {
    if (!token) return;
    const isIn = collection.componentIds?.includes(componentId);
    setPendingId(collection.id);
    try {
      const updated = isIn
        ? await collectionApi.removeComponent(collection.id, componentId, token)
        : await collectionApi.addComponent(collection.id, componentId, token);
      setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      showToast(isIn ? "Removed from collection." : "Added to collection.", "success");
    } catch (error) {
      console.error("Failed to update collection:", error);
      showToast("Failed to update collection. Please try again.", "error");
    } finally {
      setPendingId(null);
    }
  };

  const createAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setCreating(true);
    try {
      const collection = await collectionApi.create({ name: newName.trim() }, token);
      const updated = await collectionApi.addComponent(collection.id, componentId, token);
      setCollections((prev) => [updated, ...prev]);
      setNewName("");
      showToast(`Added to "${updated.name}".`, "success");
    } catch (error) {
      console.error("Failed to create collection:", error);
      showToast("Failed to create collection. Please try again.", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3 pb-4 border-b border-black dark:border-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-2 border-2 border-black dark:border-white px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider brutal-scale"
      >
        <FolderPlus className="w-4 h-4" />
        Save to collection
      </button>

      {open && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-xs font-mono text-black/60 dark:text-white/60">Loading…</p>
          ) : collections.length === 0 ? (
            <p className="text-xs font-mono text-black/60 dark:text-white/60">
              No collections yet — create your first one below.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {collections.map((collection) => {
                const isIn = collection.componentIds?.includes(componentId);
                return (
                  <li key={collection.id}>
                    <button
                      onClick={() => toggle(collection)}
                      disabled={pendingId === collection.id}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs font-mono border border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                      <span className="truncate text-left">{collection.name}</span>
                      {isIn && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={createAndAdd} className="flex items-center gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New collection"
              className="min-w-0 flex-1 px-2 py-1.5 text-xs font-mono border-2 border-black dark:border-white bg-transparent focus:outline-none"
              disabled={creating}
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              aria-label="Create collection and add this component"
              className="shrink-0 border-2 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black p-1.5 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
