"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useComponents } from "@/hooks/use-api";
import { ComponentCard } from "@/components/common/component-card";
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

  // TODO: Replace with actual logged-in user ID from auth context
  const loggedInUserId = "user-id-placeholder";

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
        <div className="p-6 border-2 border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950">
          <p className="text-sm font-mono text-red-700 dark:text-red-300 font-bold mb-3">⚠️ {error}</p>
          <button 
            onClick={refetch}
            className="border-2 border-red-600 dark:border-red-400 px-4 py-2 text-xs font-mono font-bold transition-all hover:bg-red-600 hover:text-white dark:hover:bg-red-400 dark:hover:text-black"
          >
            Try Again
          </button>
        </div>
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
            className="border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-sm font-mono font-bold transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 active:shadow-none"
          >
            Apply Filters
          </button>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="border-2 border-black dark:border-white px-6 py-3 text-sm font-mono font-bold transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 active:shadow-none"
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
          <div className="p-12 border-2 border-black dark:border-white text-center">
            <div className="inline-block w-8 h-8 border-4 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-3" />
            <div className="text-sm font-mono text-black/60 dark:text-white/60">Loading components...</div>
          </div>
        ) : components.length === 0 ? (
          <div className="p-12 border-2 border-black dark:border-white text-center space-y-4">
            <div className="text-6xl mb-4">🔍</div>
            <div className="text-2xl font-bold">No components found</div>
            {hasActiveFilters && (
              <p className="text-sm font-mono text-black/60 dark:text-white/60">
                Try adjusting your filters or{" "}
                <button
                  onClick={handleClearFilters}
                  className="underline hover:text-black dark:hover:text-white font-bold"
                >
                  clear all filters
                </button>
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-6">
              {components.map((c) => (
                <ComponentCard 
                  key={c.id || c.slug} 
                  component={c}
                  showOwnerActions={true}
                  currentUserId={loggedInUserId}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="border-2 border-black dark:border-white px-6 py-3 text-sm font-mono font-bold transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 active:shadow-none disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                >
                  ← PREV
                </button>
                
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                    // Show first page, last page, current page, and pages around current
                    const showPage = 
                      pageNum === 1 || 
                      pageNum === totalPages || 
                      Math.abs(pageNum - currentPage) <= 1;
                    
                    const showEllipsis = 
                      (pageNum === currentPage - 2 && currentPage > 3) ||
                      (pageNum === currentPage + 2 && currentPage < totalPages - 2);
                    
                    if (showEllipsis) {
                      return (
                        <span key={pageNum} className="text-sm font-mono text-black/40 dark:text-white/40 px-3 font-bold">
                          •••
                        </span>
                      );
                    }
                    
                    if (!showPage) return null;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`border-2 px-5 py-3 text-sm font-mono font-bold transition-all ${
                          pageNum === currentPage
                            ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
                            : "border-black dark:border-white hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 active:shadow-none"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="border-2 border-black dark:border-white px-6 py-3 text-sm font-mono font-bold transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 active:shadow-none disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                >
                  NEXT →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
