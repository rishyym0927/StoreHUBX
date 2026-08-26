"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { collectionApi, ApiError } from "@/lib/api";
import { CollectionCard } from "@/components/common/collection-card";
import { ComponentCardSkeleton } from "@/components/common/component-card-skeleton";
import { Pagination } from "@/components/common/pagination";
import { EmptyState } from "@/components/common/empty-state";
import { AlertTriangle, FolderOpen } from "lucide-react";
import type { Collection } from "@/types";

export default function CollectionsPage() {
  return (
    <Suspense fallback={null}>
      <CollectionsPageContent />
    </Suspense>
  );
}

function CollectionsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const itemsPerPage = parseInt(searchParams.get("limit") || "10", 10);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({ page: currentPage, limit: itemsPerPage }),
    [currentPage, itemsPerPage]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await collectionApi.list(queryParams);
      setCollections(response.collections);
      setTotal(response.total);
    } catch (err) {
      console.error("Collections fetch error:", err);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch collections"
      );
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / itemsPerPage);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    params.set("limit", String(itemsPerPage));
    router.push(`/collections?${params.toString()}`);
  };

  return (
    <div className="space-y-8 sm:space-y-12 pb-12">
      {/* Header Section */}
      <section className="border-b-2 border-black dark:border-white pb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          Browse Collections
        </h1>
        <p className="text-sm font-mono text-black/60 dark:text-white/60">
          Curated groups of components, shared publicly by the community
        </p>
      </section>

      {/* Error State */}
      {error && (
        <EmptyState
          icon={AlertTriangle}
          title="Something Went Wrong"
          description={error}
          variant="error"
          action={
            <button
              onClick={load}
              className="border-2 border-red-600 dark:border-red-400 px-4 py-2 text-xs font-mono font-bold transition-colors hover:bg-red-600 hover:text-white dark:hover:bg-red-400 dark:hover:text-black"
            >
              Try Again
            </button>
          }
        />
      )}

      {/* Results */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-black dark:border-white pb-4">
          <h2 className="text-2xl font-bold tracking-tight">
            {loading ? "Loading..." : `${total} collection${total !== 1 ? "s" : ""}`}
          </h2>
          {!loading && totalPages > 1 && (
            <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase font-bold">
              Page {currentPage} of {totalPages}
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: Math.min(itemsPerPage, 6) }, (_, i) => (
              <ComponentCardSkeleton key={i} />
            ))}
          </div>
        ) : collections.length === 0 && !error ? (
          <EmptyState
            icon={FolderOpen}
            title="No Public Collections Yet"
            description="Once someone shares a collection publicly, it'll show up here."
          />
        ) : !error && (
          <>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {collections.map((collection, i) => (
                <div
                  key={collection.id}
                  className="stagger-in h-full"
                  style={{ "--stagger-index": i } as React.CSSProperties}
                >
                  <CollectionCard collection={collection} />
                </div>
              ))}
            </div>

            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}
      </section>
    </div>
  );
}
