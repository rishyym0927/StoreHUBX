"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import * as Avatar from "@radix-ui/react-avatar";
import { useSearchParams, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/common/protected-route";
import { ComponentCard } from "@/components/common/component-card";
import { Pagination } from "@/components/common/pagination";
import { EmptyState } from "@/components/common/empty-state";
import { Tabs } from "@/components/common/tabs";
import { CollectionList } from "@/components/common/collection-list";
import { useAuth } from "@/lib/store";
import { userApi, ApiError } from "@/lib/api";
import { MapPin, Link2, Star, Package, AlertTriangle } from "lucide-react";
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
  return (
    <Suspense fallback={null}>
      <MeContent />
    </Suspense>
  );
}

function MeContent() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Pagination state
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const itemsPerPage = parseInt(searchParams.get("limit") || "10", 10);

  const [githubData, setGithubData] = useState<GithubPublicProfile | null>(null);

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

        // Fetch Github specific details if applicable
        if (data.user?.provider === 'github' && data.user?.username) {
          try {
            const res = await fetch(`https://api.github.com/users/${data.user.username}`);
            if (res.ok) {
              const ghData = await res.json();
              setGithubData(ghData);
            }
          } catch (e) {
            console.error("Github profile fetch error:", e);
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
  
  const handleComponentDeleted = (slug: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const components = prev.components.filter((c) => c.slug !== slug);
      return {
        ...prev,
        components,
        stats: { ...prev.stats, totalComponents: components.length },
      };
    });
  };

  const totalPages = profile?.components
    ? Math.ceil(profile.components.length / itemsPerPage)
    : 0;

  return (
    <ProtectedRoute>
      <div className="min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent dark:border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <EmptyState
              icon={AlertTriangle}
              title="Error Loading Profile"
              description={error}
              variant="error"
              action={
                <button
                  onClick={() => window.location.reload()}
                  className="border-2 border-red-600 dark:border-red-400 px-4 py-2 text-xs font-mono font-bold transition-colors hover:bg-red-600 hover:text-white dark:hover:bg-red-400 dark:hover:text-black"
                >
                  Retry
                </button>
              }
            />
          )}

          {/* Profile Content */}
          {profile && !loading && (
            <div className="space-y-8 sm:space-y-12">
              {/* Header Section Redesign */}
              <div className="relative border-2 border-black dark:border-white overflow-hidden mb-12 bg-white dark:bg-black shadow-[4px_4px_0px_0px_#1B1712] dark:shadow-[4px_4px_0px_0px_#EFE8D9] transition-all">
                {/* Cover Pattern Area */}
                <div className="h-32 sm:h-48 bg-grid-pattern border-b-2 border-black dark:border-white relative flex items-end overflow-hidden bg-white dark:bg-black">
                </div>
                
                <div className="px-6 sm:px-10 pb-10 relative">
                  {/* Floating Avatar */}
                  <div className="absolute -top-16 sm:-top-20 w-32 h-32 sm:w-40 sm:h-40 border-2 border-black dark:border-white bg-white dark:bg-black flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_0px_#1B1712] dark:shadow-[4px_4px_0px_0px_#EFE8D9]">
                    <Avatar.Root className="w-full h-full">
                      <Avatar.Image
                        src={profile.user.avatarUrl}
                        alt={profile.user.name || "User"}
                        className="w-full h-full object-cover"
                      />
                      <Avatar.Fallback className="w-full h-full flex items-center justify-center">
                        <span className="text-6xl sm:text-8xl font-black text-black dark:text-white">
                          {profile.user.name?.charAt(0).toUpperCase() || "U"}
                        </span>
                      </Avatar.Fallback>
                    </Avatar.Root>
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
                             <span className="flex items-center gap-1 border-2 border-black/20 dark:border-white/20 px-3 py-1.5"><MapPin className="w-3.5 h-3.5" /> {githubData.location}</span>
                          )}
                          {githubData.blog && (
                             <a href={githubData.blog.startsWith('http') ? githubData.blog : `https://${githubData.blog}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 border-2 border-black dark:border-white px-3 py-1.5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors">
                               <Link2 className="w-3.5 h-3.5" /> Website
                             </a>
                          )}
                          {githubData.html_url && (
                             <a href={githubData.html_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 border-2 border-black dark:border-white px-3 py-1.5 bg-black text-white dark:bg-white dark:text-black shadow-[4px_4px_0px_0px_#1B1712] dark:shadow-[4px_4px_0px_0px_#EFE8D9] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#1B1712] dark:hover:shadow-[6px_6px_0px_0px_#EFE8D9] transition-all active:translate-y-0 active:shadow-none">
                               <Star className="w-3.5 h-3.5" /> View GitHub
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
                      My Library
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
                      className="inline-block border-2 border-black dark:border-white px-8 py-4 text-sm font-mono font-bold transition-all hover:shadow-[6px_6px_0px_0px_#1B1712] dark:hover:shadow-[6px_6px_0px_0px_#EFE8D9] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                    >
                      ANALYTICS
                    </Link>
                    <Link
                      href="/components/new"
                      className="inline-block border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-8 py-4 text-sm font-mono font-bold transition-all hover:shadow-[6px_6px_0px_0px_#1B1712] dark:hover:shadow-[6px_6px_0px_0px_#EFE8D9] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                    >
                      + NEW COMPONENT
                    </Link>
                  </div>
                </div>

                <Tabs
                  initial="components"
                  tabs={[
                    { id: "components", label: `Components (${profile.components?.length ?? 0})` },
                    { id: "collections", label: "Collections" },
                  ]}
                >
                  {(active) =>
                    active === "collections" ? (
                      <CollectionList ownerId={profile.user.id} canCreate />
                    ) : !profile.components || profile.components.length === 0 ? (
                      <EmptyState
                        icon={Package}
                        title="No Components Yet"
                        description="Start building your component library by sharing your first UI piece with the community. Let's make something amazing."
                        size="lg"
                        action={
                          <Link
                            href="/components/new"
                            className="inline-flex items-center justify-center gap-2 border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-8 py-4 text-sm font-mono font-bold transition-all hover:shadow-[8px_8px_0px_0px_#1B1712] dark:hover:shadow-[8px_8px_0px_0px_#EFE8D9] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                          >
                            CREATE YOUR FIRST COMPONENT →
                          </Link>
                        }
                      />
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-6">
                          {paginatedComponents.map((component) => (
                            <ComponentCard
                              key={component.id || component.slug}
                              component={component}
                              showOwnerActions={true}
                              currentUserId={profile.user.id}
                              onDeleted={handleComponentDeleted}
                            />
                          ))}
                        </div>

                        {/* Pagination Controls */}
                        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
                      </>
                    )
                  }
                </Tabs>
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
    <div className="border-2 border-black dark:border-white p-6 shadow-[4px_4px_0px_0px_#1B1712] dark:shadow-[4px_4px_0px_0px_#EFE8D9] hover:shadow-[6px_6px_0px_0px_#1B1712] dark:hover:shadow-[6px_6px_0px_0px_#EFE8D9] transition-all">
      <div className="text-xs font-mono text-black/60 dark:text-white/60 mb-3 uppercase tracking-wider font-bold">
        {label}
      </div>
      <div className={`text-3xl sm:text-4xl font-bold tracking-tight ${className}`}>
        {value}
      </div>
    </div>
  );
}
