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

  // Calculate stats
  const stats = useMemo(() => {
    const uniqueFrameworks = new Set<string>();
    components.forEach(c => c.frameworks?.forEach(fw => uniqueFrameworks.add(fw)));
    return {
      totalComponents: components.length,
      frameworks: uniqueFrameworks.size,
      linkedRepos: components.filter(c => c.repoLink?.owner && c.repoLink?.repo).length
    };
  }, [components]);
 
  return (
    <div className="space-y-12 pb-12">
      {/* Hero Section */}
      <section className="border-2 border-black dark:border-white p-6 md:p-10">
        {checking ? (
          <div className="text-center py-8">
            <div className="inline-block animate-pulse text-sm font-mono text-black/60 dark:text-white/60">
              Checking session…
            </div>
          </div>
        ) : isMember ? (
          <div className="space-y-4">
            <div className="inline-block border border-black dark:border-white px-2 py-1 text-xs font-mono">
              AUTHENTICATED
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
              Welcome back,
            </h1>
            <p className="text-xl md:text-2xl font-bold tracking-tight text-black/60 dark:text-white/60">
              {profile?.user?.name || profile?.user?.username || 'Developer'}
            </p>
            <p className="text-sm md:text-base max-w-2xl text-black/60 dark:text-white/60 font-mono leading-relaxed">
              Ready to share your next masterpiece? Create components, manage versions, and showcase your work with live previews.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="/components/new"
                className="border-2 border-black dark:border-white px-4 py-2 font-mono text-sm bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95"
              >
                + Create Component
              </a>
              <a
                href="/components"
                className="border-2 border-black dark:border-white px-4 py-2 font-mono text-sm transition-transform hover:scale-105 active:scale-95"
              >
                Browse All →
              </a>
              <a
                href="/me"
                className="border border-black dark:border-white px-4 py-2 font-mono text-sm transition-transform hover:scale-105 active:scale-95"
              >
                My Profile
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="inline-block border border-black dark:border-white px-2 py-1 text-xs font-mono">
              OPEN SOURCE
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              StoreHUB<span className="text-black/40 dark:text-white/40">X</span>
            </h1>
            <p className="text-xl md:text-2xl font-bold tracking-tight text-black/80 dark:text-white/80">
              The Open-Source Component Marketplace
            </p>
            <p className="text-sm md:text-base max-w-2xl text-black/60 dark:text-white/60 font-mono leading-relaxed">
              Share, discover, and preview UI components across all frameworks. Built by developers, for developers. 100% free and open source.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={process.env.NEXT_PUBLIC_API_BASE + "/auth/github/login"}
                className="border-2 border-black dark:border-white px-4 py-2 font-mono text-sm bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95 inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                Sign in with GitHub
              </a>
              <a
                href="/components"
                className="border-2 border-black dark:border-white px-4 py-2 font-mono text-sm transition-transform hover:scale-105 active:scale-95"
              >
                Explore Components →
              </a>
            </div>
          </div>
        )}
      </section>

      {/* Stats Section */}
      {components.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border-2 border-black dark:border-white p-6 text-center transition-transform hover:scale-105 active:scale-95">
            <div className="text-4xl font-bold mb-2">{stats.totalComponents}</div>
            <div className="text-xs font-mono text-black/60 dark:text-white/60">Components</div>
          </div>
          <div className="border-2 border-black dark:border-white p-6 text-center transition-transform hover:scale-105 active:scale-95">
            <div className="text-4xl font-bold mb-2">{stats.frameworks}</div>
            <div className="text-xs font-mono text-black/60 dark:text-white/60">Frameworks</div>
          </div>
          <div className="border-2 border-black dark:border-white p-6 text-center transition-transform hover:scale-105 active:scale-95">
            <div className="text-4xl font-bold mb-2">{stats.linkedRepos}</div>
            <div className="text-xs font-mono text-black/60 dark:text-white/60">GitHub Linked</div>
          </div>
        </section>
      )}

      {/* Features Section */}
      {isMember && (
        <section className="space-y-6">
          <div className="border-b-2 border-black dark:border-white pb-4">
            <h2 className="text-2xl md:text-3xl font-bold mb-1">Why StoreHUBX?</h2>
            <p className="text-xs font-mono text-black/60 dark:text-white/60">Built for the modern development workflow</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="border-2 border-black dark:border-white p-5 transition-transform hover:scale-105 active:scale-95">
              <div className="text-3xl mb-3">🔗</div>
              <h3 className="text-lg font-bold mb-2">GitHub Integration</h3>
              <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
                Link components directly to GitHub repos. Automatic updates and version tracking.
              </p>
            </div>
            
            <div className="border-2 border-black dark:border-white p-5 transition-transform hover:scale-105 active:scale-95">
              <div className="text-3xl mb-3">👁️</div>
              <h3 className="text-lg font-bold mb-2">Live Previews</h3>
              <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
                See components in action with sandboxed live previews. No installation needed.
              </p>
            </div>
            
            <div className="border-2 border-black dark:border-white p-5 transition-transform hover:scale-105 active:scale-95">
              <div className="text-3xl mb-3">🎨</div>
              <h3 className="text-lg font-bold mb-2">Framework Agnostic</h3>
              <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
                React, Vue, Svelte, vanilla JS, and more. Share components across any framework.
              </p>
            </div>
            
            <div className="border-2 border-black dark:border-white p-5 transition-transform hover:scale-105 active:scale-95">
              <div className="text-3xl mb-3">📦</div>
              <h3 className="text-lg font-bold mb-2">Version Control</h3>
              <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
                Manage multiple versions of your components. Easy rollback and history tracking.
              </p>
            </div>
            
            <div className="border-2 border-black dark:border-white p-5 transition-transform hover:scale-105 active:scale-95">
              <div className="text-3xl mb-3">🚀</div>
              <h3 className="text-lg font-bold mb-2">Auto-Deploy</h3>
              <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
                Push to GitHub, automatically build and deploy. Streamlined workflow for rapid iteration.
              </p>
            </div>
            
            <div className="border-2 border-black dark:border-white p-5 transition-transform hover:scale-105 active:scale-95">
              <div className="text-3xl mb-3">🌐</div>
              <h3 className="text-lg font-bold mb-2">100% Open Source</h3>
              <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
                Free forever. Community-driven. Transparent development. Fork and customize as needed.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* How It Works */}
      {isMember && (
        <section className="border-2 border-black dark:border-white p-6 md:p-10 space-y-6">
          <div className="border-b-2 border-black dark:border-white pb-4">
            <h2 className="text-2xl md:text-3xl font-bold mb-1">How It Works</h2>
            <p className="text-xs font-mono text-black/60 dark:text-white/60">Get started in three simple steps</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3 text-center md:text-left">
              <div className="inline-flex items-center justify-center w-12 h-12 border-2 border-black dark:border-white font-bold text-xl">
                1
              </div>
              <h3 className="text-lg font-bold">Sign In</h3>
              <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
                Authenticate with GitHub. No additional signup required. Your GitHub account is all you need.
              </p>
            </div>
            
            <div className="space-y-3 text-center md:text-left">
              <div className="inline-flex items-center justify-center w-12 h-12 border-2 border-black dark:border-white font-bold text-xl">
                2
              </div>
              <h3 className="text-lg font-bold">Create</h3>
              <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
                Create a component, link your GitHub repo, and add metadata. Our system handles the rest.
              </p>
            </div>
            
            <div className="space-y-3 text-center md:text-left">
              <div className="inline-flex items-center justify-center w-12 h-12 border-2 border-black dark:border-white font-bold text-xl">
                3
              </div>
              <h3 className="text-lg font-bold">Share</h3>
              <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
                Your component is live with instant previews. Share the link and let others discover your work.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Latest Components */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-black dark:border-white pb-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-1">Latest Components</h2>
            <p className="text-xs font-mono text-black/60 dark:text-white/60">Recently published by the community</p>
          </div>
          <a 
            href="/components" 
            className="border-2 border-black dark:border-white px-4 py-2 text-sm font-mono transition-transform hover:scale-105 active:scale-95 hidden sm:block"
          >
            View All →
          </a>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loadingComps ? (
            <>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="border-2 border-black dark:border-white p-5 animate-pulse">
                  <div className="h-6 bg-black/10 dark:bg-white/10 mb-4"></div>
                  <div className="h-4 bg-black/10 dark:bg-white/10 mb-2"></div>
                  <div className="h-4 bg-black/10 dark:bg-white/10 w-2/3 mb-4"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-black/10 dark:bg-white/10 w-16"></div>
                    <div className="h-6 bg-black/10 dark:bg-white/10 w-16"></div>
                  </div>
                </div>
              ))}
            </>
          ) : components.length === 0 ? (
            <div className="col-span-full border-2 border-black dark:border-white p-10 text-center">
              <div className="text-5xl mb-4">📦</div>
              <div className="font-bold text-xl mb-2">No components yet</div>
              <div className="text-sm text-black/60 dark:text-white/60 font-mono mb-6">
                {isMember ? "Be the pioneer! Create the first component." : "Be part of the launch. Sign in to start publishing."}
              </div>
              {isMember ? (
                <a
                  href="/components/new"
                  className="inline-block border-2 border-black dark:border-white px-4 py-2 text-sm font-mono bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95"
                >
                  + Create First Component
                </a>
              ) : (
                <a
                  href={process.env.NEXT_PUBLIC_API_BASE + "/auth/github/login"}
                  className="inline-block border-2 border-black dark:border-white px-4 py-2 text-sm font-mono bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95"
                >
                  Get Started
                </a>
              )}
            </div>
          ) : (
            components.map((c) => (
              <a
                key={c.id || c.slug}
                href={`/components/${c.slug}`}
                className="group border-2 border-black dark:border-white p-5 transition-transform hover:scale-105 active:scale-95"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3 pb-3 border-b border-black dark:border-white">
                  <h3 className="font-bold text-lg flex-1 min-w-0 wrap-break-word">
                    {c.name}
                  </h3>
                  {c.repoLink && c.repoLink.owner && c.repoLink.repo ? (
                    <div className="ml-2 text-xs px-2 py-1 border border-green-600 text-green-600 shrink-0 font-mono">
                      ✓ Linked
                    </div>
                  ) : null}
                </div>

                {/* Description */}
                <p className="text-sm text-black/60 dark:text-white/60 mb-4 line-clamp-2 font-mono leading-relaxed min-h-10">
                  {c.description || "No description provided"}
                </p>

                {/* Frameworks */}
                {c.frameworks && c.frameworks.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {c.frameworks.slice(0, 3).map((fw) => (
                      <span
                        key={fw}
                        className="text-xs px-2 py-1 border border-black dark:border-white font-mono"
                      >
                        {fw}
                      </span>
                    ))}
                    {c.frameworks.length > 3 && (
                      <span className="text-xs px-2 py-1 border border-black dark:border-white font-mono text-black/60 dark:text-white/60">
                        +{c.frameworks.length - 3}
                      </span>
                    )}
                  </div>
                ) : null}

                {/* Tags */}
                {c.tags && c.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {c.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-mono text-black/50 dark:text-white/50"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-black/60 dark:text-white/60 mt-4 pt-3 border-t border-black dark:border-white font-mono">
                  <div>
                    {c.license || "No license"}
                  </div>
                  <div>
                    {new Date(c.updatedAt || c.createdAt).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                </div>
              </a>
            ))
          )}
        </div>

        {/* View All Mobile Button */}
        <div className="text-center sm:hidden pt-4">
          <a 
            href="/components" 
            className="inline-block border-2 border-black dark:border-white px-6 py-3 text-sm font-mono transition-transform hover:scale-105 active:scale-95"
          >
            View All Components →
          </a>
        </div>
      </section>

      {/* CTA Section */}
     
        <section className="border-2 border-black dark:border-white p-6 md:p-10 text-center space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Ready to Contribute?
          </h2>
          <p className="text-sm md:text-base text-black/60 dark:text-white/60 font-mono max-w-2xl mx-auto leading-relaxed">
            Join our growing community of developers building the future of component sharing.
          </p>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <a
              href={process.env.NEXT_PUBLIC_API_BASE + "/auth/github/login"}
              className="border-2 border-black dark:border-white px-6 py-3 text-sm font-mono bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95 inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              Get Started Now
            </a>
            <a
              href="https://github.com/rishyym0927/StoreHUBX"
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-black dark:border-white px-6 py-3 text-sm font-mono transition-transform hover:scale-105 active:scale-95 inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              Star on GitHub
            </a>
          </div>
        </section>
    
    </div>
  );
}