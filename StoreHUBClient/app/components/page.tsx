"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useComponents } from "@/hooks/use-api";
import { formatDate } from "@/lib/api-utils";
import type { ComponentsQueryParams } from "@/types";

export default function ComponentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [frameworkFilter, setFrameworkFilter] = useState(searchParams.get("framework") || "");
  const [tagsFilter, setTagsFilter] = useState(searchParams.get("tags") || "");

  // Build query params for API
  const queryParams = useMemo<ComponentsQueryParams>(() => ({
    q: searchQuery || undefined,
    framework: frameworkFilter || undefined,
    tags: tagsFilter || undefined,
    page: 1,
    limit: 50,
  }), [searchQuery, frameworkFilter, tagsFilter]);

  // Fetch components with auto-loading state
  const { data, loading, error, refetch } = useComponents(queryParams);
  
  const components = data?.components || [];

  const handleFilterChange = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (frameworkFilter) params.set("framework", frameworkFilter);
    if (tagsFilter) params.set("tags", tagsFilter);

    const queryString = params.toString();
    router.push(queryString ? `/components?${queryString}` : "/components");
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setFrameworkFilter("");
    setTagsFilter("");
    router.push("/components");
  };

  const hasActiveFilters = searchQuery || frameworkFilter || tagsFilter;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">Browse Components</h1>
        <p className="text-sm opacity-80 mt-2">
          Discover and explore UI components across different frameworks.
        </p>
      </section>

      {/* Error State */}
      {error && (
        <div className="p-4 border-2 border-red-300 bg-red-50 dark:bg-red-900/20 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-300 font-medium">⚠️ {error}</p>
          <button 
            onClick={refetch}
            className="mt-2 text-sm underline text-red-600 dark:text-red-400 hover:text-red-800"
          >
            Try again
          </button>
        </div>
      )}

      {/* Filters */}
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-medium">Filters</h2>
        
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs opacity-70 block mb-1">Search</label>
            <input
              type="text"
              placeholder="Search by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border rounded-lg p-2 bg-transparent text-sm"
            />
          </div>

          <div>
            <label className="text-xs opacity-70 block mb-1">Framework</label>
            <input
              type="text"
              placeholder="e.g., react, vue, svelte"
              value={frameworkFilter}
              onChange={(e) => setFrameworkFilter(e.target.value)}
              className="w-full border rounded-lg p-2 bg-transparent text-sm"
            />
          </div>

          <div>
            <label className="text-xs opacity-70 block mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              placeholder="e.g., ui, button, form"
              value={tagsFilter}
              onChange={(e) => setTagsFilter(e.target.value)}
              className="w-full border rounded-lg p-2 bg-transparent text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleFilterChange}
            className="px-4 py-2 rounded-lg border text-sm"
          >
            Apply Filters
          </button>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 rounded-lg border text-sm opacity-70 hover:opacity-100"
            >
              Clear Filters
            </button>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            {loading ? "Loading..." : `${components.length} component${components.length !== 1 ? "s" : ""}`}
          </h2>
        </div>

        {loading ? (
          <div className="p-8 border rounded-xl text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
            <div className="text-sm opacity-70">Loading components...</div>
          </div>
        ) : components.length === 0 ? (
          <div className="p-8 border rounded-xl text-center space-y-3">
            <div className="text-lg opacity-70">No components found</div>
            {hasActiveFilters && (
              <p className="text-sm opacity-60">
                Try adjusting your filters or{" "}
                <button
                  onClick={handleClearFilters}
                  className="underline hover:opacity-100"
                >
                  clear all filters
                </button>
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {components.map((c) => (
              <div
                key={c.id || c.slug}
                className="border rounded-xl p-5 hover:shadow-md dark:hover:shadow-lg transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <a
                    href={`/components/${c.slug}`}
                    className="flex-1 group"
                  >
                    <h3 className="font-semibold text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                      {c.name}
                    </h3>
                    {c.description && (
                      <p className="text-sm opacity-80 mt-1 line-clamp-2">
                        {c.description}
                      </p>
                    )}
                  </a>
                  
                  {/* License Badge */}
                  {c.license && (
                    <div className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-xs font-medium whitespace-nowrap">
                      {c.license}
                    </div>
                  )}
                </div>

                {/* Frameworks */}
                {c.frameworks && c.frameworks.length > 0 && (
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {c.frameworks.map((fw) => (
                      <span 
                        key={fw} 
                        className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium"
                      >
                        {fw}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tags */}
                {c.tags && c.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {c.tags.map((tag) => (
                      <span 
                        key={tag} 
                        className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Metadata Footer */}
                <div className="flex items-center gap-3 mt-4 pt-3 border-t text-xs opacity-70 flex-wrap">
                  {/* Repo Link */}
                        {c.repoLink && c.repoLink.owner && c.repoLink.repo ? (
                          <a
                            href={`https://github.com/${c.repoLink.owner}/${c.repoLink.repo}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            <span>{c.repoLink.owner}/{c.repoLink.repo}</span>
                            {c.repoLink.path && (
                              <span className="opacity-60">/{c.repoLink.path}</span>
                            )}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
                            </svg>
                            <span>Not Linked</span>
                          </span>
                        )}
                  
                  {/* Branch/Ref */}
                  {c.repoLink?.ref && (
                    <>
                      <span className="opacity-50">•</span>
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                        <span>{c.repoLink.ref}</span>
                      </div>
                    </>
                  )}

                  {/* Commit SHA */}
                  {c.repoLink?.commit && (
                    <>
                      <span className="opacity-50">•</span>
                      <div className="flex items-center gap-1 font-mono">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>{c.repoLink.commit.substring(0, 7)}</span>
                      </div>
                    </>
                  )}

                  {/* Created Date */}
                  {c.createdAt && (
                    <>
                      <span className="opacity-50">•</span>
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Created {formatDate(c.createdAt)}</span>
                      </div>
                    </>
                  )}

                  {/* Updated Date */}
                  {c.updatedAt && c.updatedAt !== c.createdAt && (
                    <>
                      <span className="opacity-50">•</span>
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Updated {formatDate(c.updatedAt)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
