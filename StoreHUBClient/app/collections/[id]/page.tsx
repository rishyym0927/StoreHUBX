"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, FolderOpen, Lock, X } from "lucide-react";
import { useAuth } from "@/lib/store";
import { collectionApi, ApiError } from "@/lib/api";
import { ComponentCard } from "@/components/common/component-card";
import { EmptyState } from "@/components/common/empty-state";
import { useToast } from "@/components/common/toast";
import { formatDate } from "@/lib/api-utils";
import type { Collection, Component } from "@/types";

export default function CollectionDetail() {
  const params = useParams();
  const collectionId = params.id as string;
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await collectionApi.get(collectionId, token ?? undefined);
      setCollection(data.collection);
      setComponents(data.components || []);
    } catch (err) {
      console.error("Collection fetch error:", err);
      setError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
          ? err.message
          : "Failed to load collection"
      );
    } finally {
      setLoading(false);
    }
  }, [collectionId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const currentUserId = user?.providerId || user?.id;
  const isOwner = !!(collection && currentUserId && currentUserId === collection.ownerId);

  const remove = async (componentId: string) => {
    if (!token || !collection) return;
    const previous = components;
    setRemovingId(componentId);
    setComponents((prev) => prev.filter((c) => c.id !== componentId));
    try {
      await collectionApi.removeComponent(collection.id, componentId, token);
    } catch (err) {
      console.error("Failed to remove component:", err);
      setComponents(previous);
      showToast("Failed to remove component. Please try again.", "error");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent dark:border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && !loading && (
          <EmptyState
            icon={AlertTriangle}
            title="Collection Not Found"
            description={error}
            variant="error"
            action={
              <Link
                href="/components"
                className="inline-block border-2 border-black dark:border-white px-4 py-2 text-xs font-mono font-bold"
              >
                Browse components
              </Link>
            }
          />
        )}

        {collection && !loading && (
          <div className="space-y-8">
            <header className="border-2 border-black dark:border-white bg-white dark:bg-black p-6 sm:p-8 space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-3 flex-wrap">
                {collection.name}
                {collection.visibility === "private" && (
                  <span className="text-xs px-2 py-1 border-2 border-black dark:border-white font-mono font-bold uppercase inline-flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> Private
                  </span>
                )}
              </h1>

              {collection.description && (
                <p className="text-sm font-mono text-black/60 dark:text-white/60 leading-relaxed max-w-2xl">
                  {collection.description}
                </p>
              )}

              <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-xs font-mono text-black/60 dark:text-white/60">
                <span>
                  {components.length} component{components.length !== 1 ? "s" : ""}
                </span>
                <Link href={`/users/${collection.ownerId}`} className="hover:underline">
                  View curator
                </Link>
                <span>Created {formatDate(collection.createdAt)}</span>
              </div>
            </header>

            {components.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title="Nothing Here Yet"
                description={
                  isOwner
                    ? "Open any component and use 'Save to collection' to add it."
                    : "This collection is empty."
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {components.map((component) => (
                  <div key={component.id} className="relative">
                    <ComponentCard component={component} />
                    {isOwner && (
                      <button
                        onClick={() => remove(component.id)}
                        disabled={removingId === component.id}
                        aria-label={`Remove ${component.name} from this collection`}
                        title="Remove from collection"
                        className="absolute top-3 right-3 z-10 border-2 border-black dark:border-white bg-white dark:bg-black p-1.5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
