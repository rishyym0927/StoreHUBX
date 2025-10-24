"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import type { UserProfileResponse, Component } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

export default function UserProfile() {
  const params = useParams();
  const userId = params.id as string;
  
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUserProfile() {
      if (!userId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`${API_BASE}/users/${userId}`, {
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          let errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
          
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error) {
              errorMessage = errorJson.error;
            } else if (errorJson.message) {
              errorMessage = errorJson.message;
            }
          } catch {
            // Use raw text
          }
          
          throw new ApiError(response.status, response.statusText, errorMessage);
        }

        const text = await response.text();
        const json = JSON.parse(text);
        
        // Normalize response structure
        const data = json?.success && json?.data !== undefined ? json.data : json;
        setProfile(data);
        console.log("User profile data:", data);
      } catch (err) {
        console.error("User profile fetch error:", err);
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load user profile");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchUserProfile();
  }, [userId]);

  return (
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

        {/* Profile Content */}
        {profile && !loading && (
          <div className="space-y-8 sm:space-y-12">
            {/* Header Section */}
            <div className="border-b border-black dark:border-white pb-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                {/* Avatar */}
                <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 border-2 border-black dark:border-white overflow-hidden">
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
                    <p className="text-base sm:text-lg font-mono text-black/60 dark:text-white/60 mb-3 break-all">
                      @{profile.user.username}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs sm:text-sm font-mono">
                    {profile.user.provider && (
                      <span className="border border-black dark:border-white px-3 py-1 capitalize">
                        {profile.user.provider}
                      </span>
                    )}
                    {profile.user.providerId && (
                      <span className="border border-black dark:border-white px-3 py-1 text-black/60 dark:text-white/60">
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
                value="active"
                className="capitalize"
              />
            </div>

            {/* Components Section */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold">
                  Components {profile.components?.length > 0 && (
                    <span className="text-black/60 dark:text-white/60">
                      ({profile.components.length})
                    </span>
                  )}
                </h2>
              </div>

              {!profile.components || profile.components.length === 0 ? (
                <div className="border border-black dark:border-white p-12 text-center">
                  <p className="text-lg font-mono text-black/60 dark:text-white/60">
                    No components published yet
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {profile.components.map((component) => (
                    <ComponentCard key={component.id || component.slug} component={component} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
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
    <div className="border border-black dark:border-white p-4 sm:p-6">
      <div className="text-xs sm:text-sm font-mono text-black/60 dark:text-white/60 mb-2">
        {label}
      </div>
      <div className={`text-2xl sm:text-3xl font-bold ${className}`}>
        {value}
      </div>
    </div>
  );
}

function ComponentCard({ component }: { component: Component }) {
  return (
    <Link
      href={`/components/${component.slug}`}
      className="block border border-black dark:border-white p-4 sm:p-6 transition-transform hover:scale-[1.02] active:scale-[0.98]"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg sm:text-xl font-bold mb-2 wrap-break-word">{component.name}</h3>
          <p className="text-sm font-mono text-black/60 dark:text-white/60 mb-3 line-clamp-2">
            {component.description}
          </p>
          
          {/* Tags & Frameworks */}
          {component.frameworks && component.frameworks.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {component.frameworks.map((fw) => (
                <span
                  key={fw}
                  className="text-xs font-mono border border-black dark:border-white px-2 py-1"
                >
                  {fw}
                </span>
              ))}
            </div>
          )}

          {component.tags && component.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {component.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-mono text-black/60 dark:text-white/60"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex sm:flex-col gap-3 sm:gap-2 text-xs font-mono text-black/60 dark:text-white/60 sm:text-right shrink-0">
          {component.license && <div>{component.license}</div>}
          <div>
            {new Date(component.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>
      </div>
    </Link>
  );
}
