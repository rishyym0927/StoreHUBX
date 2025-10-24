"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/store";
import { componentApi, userApi, ApiError } from "@/lib/api";
import type { Component, UserProfileResponse } from "@/types";

export default function Home() {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [checking, setChecking] = useState(true);

  const [components, setComponents] = useState<Component[]>([]);
  const [loadingComps, setLoadingComps] = useState(true);

  // Verify membership (only if we have a token in Zustand)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!token) {
          if (mounted) {
            setProfile(null);
            setChecking(false);
          }
          return;
        }
        const profileData = await userApi.getProfile(token);
        if (mounted) setProfile(profileData);
      } catch (error) {
        console.error("Error fetching profile:", error);
        if (mounted) setProfile(null);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  // Load latest components (public)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await componentApi.list({ limit: 12, page: 1 });
        console.log("Fetched components:", res);
        
        // Get the components array from the response
        const componentsArray = res.components || [];
        
        // Filter out components with duplicate slugs (keep the newest one)
        const uniqueComponents = componentsArray.reduce<Component[]>((acc, curr) => {
          // Find existing component with same slug
          const existingIndex = acc.findIndex(c => c.slug === curr.slug);
          
          if (existingIndex === -1) {
            // No duplicate, add to array
            acc.push(curr);
          } else {
            // Compare dates to keep newer version
            const existing = acc[existingIndex];
            const existingDate = new Date(existing.updatedAt || existing.createdAt || 0);
            const currentDate = new Date(curr.updatedAt || curr.createdAt || 0);
            
            if (currentDate > existingDate) {
              // Replace with newer version
              acc[existingIndex] = curr;
            }
          }
          return acc;
        }, []);
        
        if (mounted) setComponents(uniqueComponents);
      } catch (err) {
        console.error("Error fetching components:", err);
        if (mounted) setComponents([]);
      } finally {
        if (mounted) setLoadingComps(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isMember = useMemo(() => !!(profile && profile.status === "authenticated"), [profile]);
 
  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="border rounded-2xl p-6">
        {checking ? (
          <div className="text-sm opacity-70">Checking session…</div>
        ) : isMember ? (
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">
              Welcome back{profile?.user?.name ? `, ${profile.user.name}` : profile?.user?.email ? `, ${profile.user.email}` : ""} 👋
            </h1>
            <p className="opacity-80 text-sm">
              You can create components, add versions, and link GitHub folders for live previews.
            </p>
            <div className="flex gap-2">
              <a
                href="/components/new"
                className="px-4 py-2 rounded-xl border inline-block hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                + New Component
              </a>
              <a
                href="/components"
                className="px-4 py-2 rounded-xl border inline-block hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Browse All
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">StoreHUB</h1>
            <p className="opacity-80 text-sm">
              Share and preview UI components across frameworks. Sign in to publish and manage versions.
            </p>
            <div className="flex gap-2">
              <a
                href={process.env.NEXT_PUBLIC_API_BASE + "/auth/github/login"}
                className="px-4 py-2 rounded-xl border inline-block"
              >
                Continue with GitHub
              </a>
              <a
                href="/components"
                className="px-4 py-2 rounded-xl border inline-block"
              >
                Browse Public Components
              </a>
            </div>
          </div>
        )}
      </section>

      {/* Latest Components */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Latest Components</h2>
          <a href="/components" className="text-sm underline opacity-80 hover:opacity-100 transition">
            View all →
          </a>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loadingComps ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-xl p-5 animate-pulse">
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                  </div>
                </div>
              ))}
            </>
          ) : components.length === 0 ? (
            <div className="col-span-full border rounded-xl p-8 text-center">
              <div className="text-4xl mb-3">📦</div>
              <div className="font-medium mb-2">No components yet</div>
              <div className="text-sm opacity-70">
                {isMember ? "Be the first to create a component!" : "Sign in to start publishing components."}
              </div>
              {isMember && (
                <a
                  href="/components/new"
                  className="inline-block mt-4 px-4 py-2 rounded-xl border hover:bg-black/5 dark:hover:bg-white/5 transition"
                >
                  + Create Component
                </a>
              )}
            </div>
          ) : (
            components.map((c) => (
              <a
                key={c.id || c.slug}
                href={`/components/${c.slug}`}
                className="group border rounded-xl p-5 hover:shadow-lg hover:border-gray-400 dark:hover:border-gray-600 transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                      {c.name}
                    </h3>
                  </div>
                  {c.repoLink && (
                    <div className="ml-2 text-xs px-2 py-1 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 shrink-0">
                      🔗 Linked
                    </div>
                  )}
                </div>

                {/* Description */}
                {c.description ? (
                  <p className="text-sm opacity-80 mb-4 line-clamp-2 min-h-10">
                    {c.description}
                  </p>
                ) : (
                  <p className="text-sm opacity-50 mb-4 italic min-h-10">
                    No description provided
                  </p>
                )}

                {/* Frameworks */}
                {c.frameworks && c.frameworks.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {c.frameworks.slice(0, 3).map((fw) => (
                      <span
                        key={fw}
                        className="text-xs px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      >
                        {fw}
                      </span>
                    ))}
                    {c.frameworks.length > 3 && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 opacity-70">
                        +{c.frameworks.length - 3}
                      </span>
                    )}
                  </div>
                ) : null}

                {/* Tags */}
                {c.tags && c.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {c.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 opacity-70"
                      >
                        #{tag}
                      </span>
                    ))}
                    {c.tags.length > 3 && (
                      <span className="text-xs px-2 py-0.5 opacity-50">
                        +{c.tags.length - 3} more
                      </span>
                    )}
                  </div>
                ) : null}

                {/* Footer */}
                <div className="flex items-center justify-between text-xs opacity-60 mt-4 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    {c.license ? (
                      <span title="License">📄 {c.license}</span>
                    ) : (
                      <span>📄 No license</span>
                    )}
                  </div>
                  <div title="Last updated">
                    {new Date(c.updatedAt || c.createdAt).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      year: new Date(c.updatedAt || c.createdAt).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                    })}
                  </div>
                </div>

                {/* Repo Link Info */}
                {c.repoLink && (
                  <div className="mt-3 pt-3 border-t text-xs opacity-60 flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                    </svg>
                    <span className="truncate">
                      {c.repoLink.owner}/{c.repoLink.repo}
                      {c.repoLink.path && `/${c.repoLink.path}`}
                    </span>
                  </div>
                )}
              </a>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
