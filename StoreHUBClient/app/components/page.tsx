"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useComponents } from "@/hooks/use-api";
import { ComponentCard } from "@/components/common/component-card";
import { Pagination } from "@/components/common/pagination";
import { ComponentCardSkeleton } from "@/components/common/component-card-skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useAuth } from "@/lib/store";
import { AlertTriangle, Search } from "lucide-react";
import type { ComponentsQueryParams } from "@/types";

export default function ComponentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [frameworkFilter, setFrameworkFilter] = useState(searchParams.get("framework") || "");
  const [tagsFilter, setTagsFilter] = useState(searchParams.get("tags") || "");
  
  // Get page and limit from URL
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const itemsPerPage = parseInt(searchParams.get("limit") || "10", 10);

  // Build query params for API
  const queryParams = useMemo<ComponentsQueryParams>(() => ({
    q: searchQuery || undefined,
    framework: frameworkFilter || undefined,
    tags: tagsFilter || undefined,
    page: currentPage,
    limit: itemsPerPage,
  }), [searchQuery, frameworkFilter, tagsFilter, currentPage, itemsPerPage]);

  // Fetch components with auto-loading state
  const { data, loading, error, refetch } = useComponents(queryParams);
  
  const components = data?.components || [];
  const totalComponents = data?.total || 0;
  const totalPages = Math.ceil(totalComponents / itemsPerPage);

  const handleFilterChange = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (frameworkFilter) params.set("framework", frameworkFilter);
    if (tagsFilter) params.set("tags", tagsFilter);
    params.set("page", "1"); // Reset to page 1 when filters change
    params.set("limit", String(itemsPerPage));

    const queryString = params.toString();
    router.push(queryString ? `/components?${queryString}` : "/components");
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setFrameworkFilter("");
    setTagsFilter("");
    router.push("/components");
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    params.set("limit", String(itemsPerPage));
    router.push(`/components?${params.toString()}`);
  };

  const hasActiveFilters = searchQuery || frameworkFilter || tagsFilter;

  const { user } = useAuth();
  const loggedInUserId = user?.id;

  return (
    <div className="space-y-8 sm:space-y-12 pb-12">
      {/* Header Section */}
      <section className="border-b-2 border-black dark:border-white pb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          Browse Components
        </h1>
        <p className="text-sm font-mono text-black/60 dark:text-white/60">
          Discover and explore UI components across different frameworks
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
              onClick={refetch}
              className="border-2 border-red-600 dark:border-red-400 px-4 py-2 text-xs font-mono font-bold transition-colors hover:bg-red-600 hover:text-white dark:hover:bg-red-400 dark:hover:text-black"
            >
              Try Again
            </button>
          }
        />
      )}

      {/* Filters */}
      <section className="border-2 border-black dark:border-white p-6 space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Filters</h2>
        
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs font-mono text-black/60 dark:text-white/60 block mb-2 uppercase font-bold">Search</label>
            <input
              type="text"
              placeholder="Search by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-2 border-black dark:border-white p-3 bg-transparent text-sm font-mono focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:focus:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-black/60 dark:text-white/60 block mb-2 uppercase font-bold">Framework</label>
            <input
              type="text"
              placeholder="e.g., react, vue, svelte"
              value={frameworkFilter}
              onChange={(e) => setFrameworkFilter(e.target.value)}
              className="w-full border-2 border-black dark:border-white p-3 bg-transparent text-sm font-mono focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:focus:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-black/60 dark:text-white/60 block mb-2 uppercase font-bold">Tags (comma-separated)</label>
            <input
              type="text"
              placeholder="e.g., ui, button, form"
              value={tagsFilter}
              onChange={(e) => setTagsFilter(e.target.value)}
              className="w-full border-2 border-black dark:border-white p-3 bg-transparent text-sm font-mono focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:focus:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] transition-all"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleFilterChange}
            className="brutal-lift border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-sm font-mono font-bold"
          >
            Apply Filters
          </button>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="brutal-lift border-2 border-black dark:border-white px-6 py-3 text-sm font-mono font-bold"
            >
              Clear Filters
            </button>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-black dark:border-white pb-4">
          <h2 className="text-2xl font-bold tracking-tight">
            {loading ? "Loading..." : `${totalComponents} component${totalComponents !== 1 ? "s" : ""}`}
          </h2>
          {!loading && totalPages > 1 && (
            <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase font-bold">
              Page {currentPage} of {totalPages}
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid gap-6">
            {Array.from({ length: Math.min(itemsPerPage, 10) }, (_, i) => (
              <ComponentCardSkeleton key={i} />
            ))}
          </div>
        ) : components.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No Components Found"
            description={hasActiveFilters ? "Try adjusting your filters to see more results." : undefined}
            action={
              hasActiveFilters ? (
                <button
                  onClick={handleClearFilters}
                  className="underline hover:text-black dark:hover:text-white font-bold text-sm font-mono"
                >
                  Clear all filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="grid gap-6">
              {components.map((c, i) => (
                <div
                  key={c.id || c.slug}
                  className="stagger-in"
                  style={{ "--stagger-index": i } as React.CSSProperties}
                >
                  <ComponentCard
                    component={c}
                    showOwnerActions={true}
                    currentUserId={loggedInUserId}
                  />
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}
      </section>
    </div>
  );
}
