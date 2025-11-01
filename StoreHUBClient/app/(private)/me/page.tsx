"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/common/protected-route";
import { useAuth } from "@/lib/store";
import { userApi, ApiError } from "@/lib/api";
import type { UserProfileResponse, Component } from "@/types";

export default function Me() {
  const { user, token } = useAuth();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Pagination state
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const itemsPerPage = parseInt(searchParams.get("limit") || "10", 10);

  useEffect(() => {
    async function fetchProfile() {
      if (!token) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        const data = await userApi.getProfile(token);
        setProfile(data);
        console.log("Profile data:", data);
      } catch (err) {
        console.error("Profile fetch error:", err);
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [token]);

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    params.set("limit", String(itemsPerPage));
    router.push(`?${params.toString()}`);
  };

  // Calculate paginated components
  const paginatedComponents = profile?.components 
    ? profile.components.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
      )
    : [];
  
  const totalPages = profile?.components 
    ? Math.ceil(profile.components.length / itemsPerPage)
    : 0;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent dark:border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="border border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950 p-4 sm:p-6">
              <h3 className="text-sm font-bold font-mono text-red-600 dark:text-red-400 mb-2">
                Error loading profile
              </h3>
              <p className="text-sm font-mono text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 border border-red-600 dark:border-red-400 px-4 py-2 text-sm font-mono transition-transform hover:scale-105 active:scale-95"
              >
                Retry
              </button>
            </div>
          )}

          {/* No Token State */}
          {!token && !loading && (
            <div className="border border-black dark:border-white p-12 text-center">
              <p className="text-lg font-mono text-black/60 dark:text-white/60 mb-4">
                You need to be logged in to view your profile
              </p>
              <Link
                href="/auth/callback"
                className="inline-block border-2 border-black dark:border-white px-6 py-3 text-sm font-mono transition-transform hover:scale-105 active:scale-95"
              >
                Login
              </Link>
            </div>
          )}

          {/* Profile Content */}
          {profile && !loading && (
            <div className="space-y-8 sm:space-y-12">
              {/* Header Section */}
              <div className="border-b-2 border-black dark:border-white pb-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  {/* Avatar */}
                  <div className="relative w-24 h-24 sm:w-32 sm:h-32 shrink-0 border-2 border-black dark:border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
                    {profile.user.avatarUrl ? (
                      <img
                        src={profile.user.avatarUrl}
                        alt={profile.user.name || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-black dark:bg-white flex items-center justify-center">
                        <span className="text-4xl sm:text-5xl font-bold text-white dark:text-black">
                          {profile.user.name?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-2 wrap-break-word">
                      {profile.user.name || 'Anonymous User'}
                    </h1>
                    {profile.user.username && (
                      <p className="text-base sm:text-lg font-mono text-black/60 dark:text-white/60 mb-4 break-all">
                        @{profile.user.username}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs sm:text-sm font-mono">
                      {profile.user.email && (
                        <span className="border-2 border-black dark:border-white px-3 py-1.5 font-bold">
                          {profile.user.email}
                        </span>
                      )}
                      {profile.user.provider && (
                        <span className="border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-3 py-1.5 capitalize font-bold">
                          {profile.user.provider}
                        </span>
                      )}
                      {profile.user.providerId && (
                        <span className="border border-black dark:border-white px-3 py-1.5 text-black/60 dark:text-white/60 font-mono text-xs">
                          ID: {profile.user.providerId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard 
                  label="Components" 
                  value={profile.stats?.totalComponents ?? profile.components.length} 
                />
                <StatCard 
                  label="Joined" 
                  value={profile.user.createdAt 
                    ? new Date(profile.user.createdAt).toLocaleDateString("en-US", { 
                        month: "short", 
                        year: "numeric" 
                      })
                    : "N/A"
                  } 
                />
                <StatCard 
                  label="Status" 
                  value={profile.status || "active"}
                  className="capitalize"
                />
              </div>

              {/* Components Section */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b-2 border-black dark:border-white">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">
                      My Components
                    </h2>
                    {profile.components?.length > 0 && (
                      <p className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider font-bold">
                        {profile.components.length} Component{profile.components.length !== 1 ? 's' : ''} Total
                      </p>
                    )}
                  </div>
                  <Link
                    href="/components/new"
                    className="inline-block border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-sm font-mono font-bold transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 active:shadow-none"
                  >
                    + NEW COMPONENT
                  </Link>
                </div>

                {!profile.components || profile.components.length === 0 ? (
                  <div className="border-2 border-black dark:border-white p-12 sm:p-16 text-center">
                    <div className="max-w-md mx-auto space-y-6">
                      <div className="text-6xl">📦</div>
                      <div>
                        <h3 className="text-2xl font-bold mb-2">No Components Yet</h3>
                        <p className="text-sm font-mono text-black/60 dark:text-white/60 leading-relaxed">
                          Start building your component library by creating your first component.
                        </p>
                      </div>
                      <Link
                        href="/components/new"
                        className="inline-block border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-8 py-4 text-sm font-mono font-bold transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 active:shadow-none"
                      >
                        CREATE YOUR FIRST COMPONENT
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4">
                      {paginatedComponents.map((component) => (
                        <ComponentCard key={component.id || component.slug} component={component} />
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
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

function StatCard({ 
  label, 
  value, 
  className = "" 
}: { 
  label: string; 
  value: string | number; 
  className?: string;
}) {
  return (
    <div className="border-2 border-black dark:border-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] transition-all">
      <div className="text-xs font-mono text-black/60 dark:text-white/60 mb-3 uppercase tracking-wider font-bold">
        {label}
      </div>
      <div className={`text-3xl sm:text-4xl font-bold tracking-tight ${className}`}>
        {value}
      </div>
    </div>
  );
}

function ComponentCard({ component }: { component: Component }) {
  const isLinked = component.repoLink?.owner && component.repoLink?.repo;
  
  return (
    <Link
      href={`/components/${component.slug}`}
      className="group block border-2 border-black dark:border-white transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] active:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:active:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
    >
      <div className="p-6 space-y-4">
        {/* Header Section */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl sm:text-2xl font-bold mb-2 tracking-tight group-hover:underline decoration-2">
              {component.name}
            </h3>
            {component.description && (
              <p className="text-sm font-mono text-black/70 dark:text-white/70 leading-relaxed line-clamp-2">
                {component.description}
              </p>
            )}
          </div>
          
          {/* Status Badge */}
          <div className="shrink-0">
            {isLinked ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 border border-black dark:border-white bg-green-50 dark:bg-green-950">
                <span className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full"></span>
                <span className="text-xs font-mono font-bold text-green-600 dark:text-green-400">
                  LINKED
                </span>
              </div>
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
              <span
                key={fw}
                className="px-2.5 py-1 border border-black dark:border-white text-xs font-mono font-bold uppercase tracking-wide hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
              >
                {fw}
              </span>
            ))}
          </div>
        )}

        {/* Tags Section */}
        {component.tags && component.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {component.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="text-xs font-mono text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
              >
                #{tag}
              </span>
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

          {/* Repository Info */}
          {isLinked && (
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span className="font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
                {component.repoLink?.owner}/{component.repoLink?.repo}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
