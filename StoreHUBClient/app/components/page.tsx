"use client";

import { Suspense, useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useComponents } from "@/hooks/use-api";
import { ComponentCard } from "@/components/common/component-card";
import { Pagination } from "@/components/common/pagination";
import { ComponentCardSkeleton } from "@/components/common/component-card-skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useAuth } from "@/lib/store";
import { AlertTriangle, Search, X } from "lucide-react";
import type { ComponentsQueryParams } from "@/types";

export default function ComponentsPage() {
  return (
    <Suspense fallback={null}>
      <ComponentsPageContent />
    </Suspense>
  );
}

// The framework filter matches stored values exactly (the backend lowercases
// only the query), so these are the canonical lowercase values. Offering them
// as chips also avoids the typo/casing problem free text invites.
const FRAMEWORKS = ["react", "nextjs", "vue", "svelte", "angular", "solid"];

// "newest" is the backend default and is represented as "" in state/URL (the
// param is omitted entirely). Normalize an explicit "newest" read from the
// URL down to "" so the dropdown, hasActiveFilters, and the outgoing query
// params all agree.
const readSort = (params: URLSearchParams) => {
  const sort = params.get("sort") || "";
  return sort === "newest" ? "" : sort;
};

function ComponentsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [frameworkFilter, setFrameworkFilter] = useState(searchParams.get("framework") || "");
  const [tagsFilter, setTagsFilter] = useState(searchParams.get("tags") || "");
  const [sortFilter, setSortFilter] = useState(readSort(searchParams));

  // Keep the inputs in sync with the URL on browser back/forward navigation,
  // where the URL changes without the user touching these fields directly.
  useEffect(() => {
    setSearchQuery(searchParams.get("q") || "");
    setFrameworkFilter(searchParams.get("framework") || "");
    setTagsFilter(searchParams.get("tags") || "");
    setSortFilter(readSort(searchParams));
  }, [searchParams]);

  // Get page and limit from URL
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const itemsPerPage = parseInt(searchParams.get("limit") || "10", 10);

  // Build query params for API
  const queryParams = useMemo<ComponentsQueryParams>(() => ({
    q: searchQuery || undefined,
    framework: frameworkFilter || undefined,
    tags: tagsFilter || undefined,
    sort: sortFilter || undefined,
    page: currentPage,
    limit: itemsPerPage,
  }), [searchQuery, frameworkFilter, tagsFilter, sortFilter, currentPage, itemsPerPage]);

  // Fetch components with auto-loading state
  const { data, loading, error, refetch } = useComponents(queryParams);
  
  const components = data?.components || [];
  const totalComponents = data?.total || 0;
  const totalPages = Math.ceil(totalComponents / itemsPerPage);

  // Single place that turns filter state into a URL. Filters always reset to
  // page 1, since results shift underneath the old page number.
  const pushFilters = useCallback(
    (next: { q?: string; framework?: string; tags?: string; sort?: string }) => {
      const params = new URLSearchParams();
      if (next.q) params.set("q", next.q);
      if (next.framework) params.set("framework", next.framework);
      if (next.tags) params.set("tags", next.tags);
      // "newest" is the backend default, so omit it entirely to keep existing
      // URLs/behavior unaffected.
      if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
      params.set("page", "1");
      params.set("limit", String(itemsPerPage));
      router.push(`/components?${params.toString()}`);
    },
    [router, itemsPerPage]
  );

  // Text filters apply as you type. Debounced, and only pushed when the value
  // actually differs from the URL — otherwise the sync effect above and this
  // one would push each other in a loop.
  useEffect(() => {
    const urlQ = searchParams.get("q") || "";
    const urlTags = searchParams.get("tags") || "";
    if (searchQuery === urlQ && tagsFilter === urlTags) return;

    const timer = setTimeout(() => {
      pushFilters({ q: searchQuery, framework: frameworkFilter, tags: tagsFilter, sort: sortFilter });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, tagsFilter, frameworkFilter, sortFilter, searchParams, pushFilters]);

  // Chips are a deliberate click, so they apply immediately.
  const toggleFramework = (framework: string) => {
    const next = frameworkFilter === framework ? "" : framework;
    setFrameworkFilter(next);
    pushFilters({ q: searchQuery, framework: next, tags: tagsFilter, sort: sortFilter });
  };

  // A dropdown selection is also a deliberate action, so it applies immediately.
  const handleSortChange = (sort: string) => {
    setSortFilter(sort);
    pushFilters({ q: searchQuery, framework: frameworkFilter, tags: tagsFilter, sort });
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setFrameworkFilter("");
    setTagsFilter("");
    setSortFilter("");
    router.push("/components");
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    params.set("limit", String(itemsPerPage));
    router.push(`/components?${params.toString()}`);
  };

  const hasActiveFilters = searchQuery || frameworkFilter || tagsFilter || sortFilter;

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

      {/* Filters — everything applies as you go; nothing to submit */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40 dark:text-white/40 pointer-events-none" />
            <input
              type="text"
              placeholder="Search components…"
              aria-label="Search components"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-2 border-black dark:border-white pl-10 pr-3 py-3 bg-transparent text-sm font-mono focus:outline-none focus:shadow-[4px_4px_0px_0px_#1B1712] dark:focus:shadow-[4px_4px_0px_0px_#EFE8D9] transition-all"
            />
          </div>
          <input
            type="text"
            placeholder="Tags (comma-separated)"
            aria-label="Filter by tags, comma-separated"
            value={tagsFilter}
            onChange={(e) => setTagsFilter(e.target.value)}
            className="sm:w-64 border-2 border-black dark:border-white px-3 py-3 bg-transparent text-sm font-mono focus:outline-none focus:shadow-[4px_4px_0px_0px_#1B1712] dark:focus:shadow-[4px_4px_0px_0px_#EFE8D9] transition-all"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {FRAMEWORKS.map((framework) => {
            const active = frameworkFilter === framework;
            return (
              <button
                key={framework}
                onClick={() => toggleFramework(framework)}
                aria-pressed={active}
                className={`brutal-scale px-3 py-1.5 border-2 border-black dark:border-white font-mono text-xs font-bold uppercase tracking-wider ${
                  active
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {framework}
              </button>
            );
          })}

          <select
            aria-label="Sort components"
            value={sortFilter}
            onChange={(e) => handleSortChange(e.target.value)}
            className="brutal-scale border-2 border-black dark:border-white bg-white dark:bg-black px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider focus:outline-none cursor-pointer"
          >
            <option value="">Newest</option>
            <option value="rating">Top Rated</option>
            <option value="likes">Most Liked</option>
            <option value="views">Most Viewed</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs underline hover:no-underline"
            >
              <X className="w-3.5 h-3.5" /> Clear
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
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: Math.min(itemsPerPage, 6) }, (_, i) => (
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
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {components.map((c, i) => (
                <div
                  key={c.id || c.slug}
                  className="stagger-in h-full"
                  style={{ "--stagger-index": i } as React.CSSProperties}
                >
                  <ComponentCard
                    component={c}
                    showOwnerActions={true}
                    currentUserId={loggedInUserId}
                    onDeleted={() => refetch()}
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
