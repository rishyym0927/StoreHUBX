"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/common/protected-route";
import { ComponentCard } from "@/components/common/component-card";
import { useAuth } from "@/lib/store";
import { userApi, ApiError } from "@/lib/api";
import type { UserProfileResponse } from "@/types";

interface GithubPublicProfile {
  bio: string | null;
  location: string | null;
  followers: number;
  following: number;
  public_repos: number;
  html_url: string;
  blog: string | null;
  twitter_username: string | null;
}

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

  const [githubData, setGithubData] = useState<GithubPublicProfile | null>(null);
  const [loadingGithub, setLoadingGithub] = useState(false);

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

        // Fetch Github specific details if applicable
        if (data.user?.provider === 'github' && data.user?.username) {
          setLoadingGithub(true);
          try {
            const res = await fetch(`https://api.github.com/users/${data.user.username}`);
            if (res.ok) {
              const ghData = await res.json();
              setGithubData(ghData);
            }
          } catch (e) {
            console.error("Github profile fetch error:", e);
          } finally {
            setLoadingGithub(false);
          }
        }
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
              {/* Header Section Redesign */}
              <div className="relative border-2 border-black dark:border-white overflow-hidden mb-12 bg-white dark:bg-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] transition-all">
                {/* Cover Pattern Area */}
                <div className="h-32 sm:h-48 bg-grid-pattern border-b-2 border-black dark:border-white relative flex items-end overflow-hidden bg-white dark:bg-black">
                </div>
                
                <div className="px-6 sm:px-10 pb-10 relative">
                  {/* Floating Avatar */}
                  <div className="absolute -top-16 sm:-top-20 w-32 h-32 sm:w-40 sm:h-40 border-2 border-black dark:border-white bg-white dark:bg-black flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
                    {profile.user.avatarUrl ? (
                      <img
                        src={profile.user.avatarUrl}
                        alt={profile.user.name || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-6xl sm:text-8xl font-black text-black dark:text-white">
                        {profile.user.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    )}
                  </div>

                  {/* Main Info */}
                  <div className="pt-20 sm:pt-24 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div>
                        <h1 className="text-3xl sm:text-5xl font-black tracking-tight uppercase break-words leading-tight">
                          {profile.user.name || 'Developer'}
                        </h1>
                        {profile.user.username && (
                          <p className="text-lg sm:text-xl font-mono font-bold text-black/60 dark:text-white/60 mt-1">
                            @{profile.user.username}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-2 text-xs sm:text-sm font-mono font-bold shrink-0">
                        {profile.user.email && (
                          <span className="border-2 border-black dark:border-white bg-white dark:bg-black px-3 py-1.5 flex items-center">
                            {profile.user.email}
                          </span>
                        )}
                        {profile.user.provider && (
                          <span className="border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-3 py-1.5 uppercase flex items-center">
                            {profile.user.provider}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* GitHub Extra Data */}
                    {githubData && (
                      <div className="font-mono space-y-4">
                        {githubData.bio && (
                          <p className="border-l-4 border-black dark:border-white pl-4 py-2 text-sm text-black/80 dark:text-white/80 font-bold bg-black/5 dark:bg-white/5 max-w-3xl">
                            {githubData.bio}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 text-xs font-bold text-black/70 dark:text-white/70">
                          {githubData.location && (
                             <span className="flex items-center gap-1 border-2 border-black/20 dark:border-white/20 px-3 py-1.5">📍 {githubData.location}</span>
                          )}
                          {githubData.blog && (
                             <a href={githubData.blog.startsWith('http') ? githubData.blog : `https://${githubData.blog}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 border-2 border-black dark:border-white px-3 py-1.5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors">
                               🔗 Website
                             </a>
                          )}
                          {githubData.html_url && (
                             <a href={githubData.html_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 border-2 border-black dark:border-white px-3 py-1.5 bg-black text-white dark:bg-white dark:text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] transition-all active:translate-y-0 active:shadow-none">
                               ⭐ View GitHub
                             </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Section */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard 
                  label="Local Comps" 
                  value={profile.stats?.totalComponents ?? profile.components.length} 
                />
                <StatCard 
                  label="Github Repos" 
                  value={githubData ? githubData.public_repos : "..."} 
                />
                <StatCard 
                  label="Followers" 
                  value={githubData ? githubData.followers : "..."} 
                />
                <StatCard 
                  label="Joined StoreHUBX" 
                  value={profile.user.createdAt 
                    ? new Date(profile.user.createdAt).toLocaleDateString("en-US", { 
                        month: "short", 
                        year: "numeric" 
                      })
                    : "N/A"
                  } 
                />
              </div>

              {/* Components Section */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b-2 border-black dark:border-white">
                  <div>
                    <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter mb-1">
                      My Components
                    </h2>
                    {profile.components?.length > 0 && (
                      <p className="text-sm font-mono text-black/60 dark:text-white/60 uppercase tracking-wider font-bold">
                        {profile.components.length} Component{profile.components.length !== 1 ? 's' : ''} Published
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href="/me/analytics"
                      className="inline-block border-2 border-black dark:border-white px-8 py-4 text-sm font-mono font-bold transition-all hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                    >
                      ANALYTICS
                    </Link>
                    <Link
                      href="/components/new"
                      className="inline-block border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-8 py-4 text-sm font-mono font-bold transition-all hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                    >
                      + NEW COMPONENT
                    </Link>
                  </div>
                </div>

                {!profile.components || profile.components.length === 0 ? (
                  <div className="border-2 border-black dark:border-white p-12 sm:p-20 text-center bg-grid-pattern relative">
                    <div className="absolute inset-0 bg-white/80 dark:bg-black/80 pointer-events-none"></div>
                    <div className="relative z-10 max-w-lg mx-auto space-y-6">
                      <div className="text-6xl sm:text-8xl">📦</div>
                      <div>
                        <h3 className="text-4xl font-black uppercase tracking-tighter mb-4">No Components Yet</h3>
                        <p className="text-sm font-mono text-black/80 dark:text-white/80 leading-relaxed font-bold">
                          Start building your component library by sharing your first UI piece with the community. Let&apos;s make something amazing.
                        </p>
                      </div>
                      <Link
                        href="/components/new"
                        className="inline-flex items-center justify-center gap-2 border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-8 py-4 text-sm font-mono font-bold transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                      >
                        CREATE YOUR FIRST COMPONENT →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-6">
                      {paginatedComponents.map((component) => (
                        <ComponentCard 
                          key={component.id || component.slug} 
                          component={component}
                          showOwnerActions={true}
                          currentUserId={profile.user.id}
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
