"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/store";
import { componentApi, userApi } from "@/lib/api";
import { ComponentCard } from "@/components/common/component-card";
import { Sparkles, Star, Palette } from "lucide-react";
import type { Component, UserProfileResponse } from "@/types";

// Featured Component Card
function FeaturedComponentCard({ component }: { component: Component }) {
  return (
    <div className="border border-black dark:border-white transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]">
      <ComponentCard component={component} />
    </div>
  );
}

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
      {/* Massive Hero Section with Grid Pattern */}
      <section className="relative overflow-hidden border-2 border-black dark:border-white bg-grid-pattern p-8 md:p-16 lg:p-24 flex flex-col items-center text-center">
        <div className="absolute inset-0 bg-white/60 dark:bg-black/60 pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          {checking ? (
            <div className="inline-block animate-pulse text-sm font-mono text-black/60 dark:text-white/60">
              Checking session…
            </div>
          ) : isMember ? (
            <div className="space-y-6">
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[1.1]">
                WELCOME BACK, <br className="hidden md:block"/>
                <span className="text-black dark:text-white bg-white dark:bg-black px-2 border-r-4 border-b-4 border-black dark:border-white">
                  {profile?.user?.name?.toUpperCase() || profile?.user?.username?.toUpperCase() || 'DEVELOPER'}
                </span>
              </h1>
              <p className="text-lg md:text-xl font-mono text-black/80 dark:text-white/80 max-w-2xl mx-auto">
                Discover the latest UI components and build faster with our thriving community.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Link
                  href="/components/new"
                  className="border-2 border-black dark:border-white px-8 py-4 font-mono font-bold text-sm bg-black text-white dark:bg-white dark:text-black transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                >
                  + CREATE COMPONENT
                </Link>
                <Link
                  href="/components"
                  className="border-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white px-8 py-4 font-mono font-bold text-sm transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                >
                  BROWSE ALL
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter uppercase leading-[1.1]">
                BUILD UI <br />
                <span className="bg-black text-white dark:bg-white dark:text-black px-4 block sm:inline-block border-2 border-transparent">FASTER.</span>
              </h1>
              <p className="text-lg md:text-xl font-mono text-black/80 dark:text-white/80 max-w-2xl mx-auto font-bold">
                The open source registry for sharing and discovering UI components across all frameworks.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <a
                  href={process.env.NEXT_PUBLIC_API_BASE + "/auth/github/login"}
                  className="flex items-center justify-center gap-3 border-2 border-black dark:border-white px-8 py-4 bg-black text-white dark:bg-white dark:text-black font-mono font-bold text-sm transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  SIGN IN WITH GITHUB
                </a>
                <Link
                  href="/components"
                  className="border-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white px-8 py-4 font-mono font-bold text-sm transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
                >
                  EXPLORE COMPONENTS
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Infinite Marquee Section */}
      <section className="border-x-2  border-black dark:border-white overflow-hidden py-3 bg-white text-black dark:bg-black dark:text-white">
        <div className="flex w-max animate-marquee space-x-8 items-center font-mono font-black text-xl uppercase tracking-widest whitespace-nowrap">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex space-x-8 items-center px-4">
              <span>REACT</span>
              <span className="text-black/30 dark:text-white/30">•</span>
              <span>NEXT.JS</span>
              <span className="text-black/30 dark:text-white/30">•</span>
              <span>VITE</span>
              <span className="text-black/30 dark:text-white/30">•</span>
              <span>SVELTE</span>
              <span className="text-black/30 dark:text-white/30">•</span>
              <span>VUE</span>
              <span className="text-black/30 dark:text-white/30">•</span>
              <span>TAILWIND</span>
              <span className="text-black/30 dark:text-white/30">•</span>
              <span>HTML</span>
              <span className="text-black/30 dark:text-white/30">•</span>
              <span>CSS</span>
              <span className="text-black/30 dark:text-white/30">•</span>
              <span>ANGULAR</span>
              <span className="text-black/30 dark:text-white/30">•</span>
              <span>SOLID</span>
              <span className="text-black/30 dark:text-white/30">•</span>
            </div>
          ))}
        </div>
      </section>

      {/* Why StoreHUBX / Stats Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-0 border-x-2 border-y-2  border-black dark:border-white divide-y-2 md:divide-y-0 md:divide-x-2 divide-black dark:divide-white">
        <div className="p-8 space-y-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <div className="w-12 h-12 border-2 border-black dark:border-white flex items-center justify-center text-xl font-bold bg-white text-black dark:bg-black dark:text-white">
            01
          </div>
          <h3 className="text-2xl font-bold uppercase tracking-tight">Live Previews</h3>
          <p className="font-mono text-sm text-black/70 dark:text-white/70">
            See exactly what you are getting. Every component supports an interactive live preview rendered securely.
          </p>
          <div className="pt-4 border-t-2 border-black dark:border-white">
            <span className="text-4xl font-black">{stats.totalComponents}</span>
            <span className="font-mono text-xs ml-2 text-black/60 dark:text-white/60">TOTAL COMPS</span>
          </div>
        </div>
        <div className="p-8 space-y-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <div className="w-12 h-12 border-2 border-black dark:border-white flex items-center justify-center text-xl font-bold bg-white text-black dark:bg-black dark:text-white">
            02
          </div>
          <h3 className="text-2xl font-bold uppercase tracking-tight">Any Framework</h3>
          <p className="font-mono text-sm text-black/70 dark:text-white/70">
            Tag and filter components by the framework of your choice. Find exactly what fits your tech stack.
          </p>
          <div className="pt-4 border-t-2 border-black dark:border-white">
            <span className="text-4xl font-black">{stats.frameworks}</span>
            <span className="font-mono text-xs ml-2 text-black/60 dark:text-white/60">FRAMEWORKS</span>
          </div>
        </div>
        <div className="p-8 space-y-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <div className="w-12 h-12 border-2 border-black dark:border-white flex items-center justify-center text-xl font-bold bg-white text-black dark:bg-black dark:text-white">
            03
          </div>
          <h3 className="text-2xl font-bold uppercase tracking-tight">GitHub Linked</h3>
          <p className="font-mono text-sm text-black/70 dark:text-white/70">
            Link directly to your GitHub repository tags or branches to version your components automatically.
          </p>
          <div className="pt-4 border-t-2 border-black dark:border-white">
            <span className="text-4xl font-black">{stats.linkedRepos}</span>
            <span className="font-mono text-xs ml-2 text-black/60 dark:text-white/60">LINKED REPOS</span>
          </div>
        </div>
      </section>



      {/* Featured Component Previews - THE MAIN ATTRACTION */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-black dark:border-white pb-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-1 flex items-center gap-2"><Sparkles className="w-7 h-7 md:w-8 md:h-8" /> Live Component Previews</h2>
            <p className="text-sm font-mono text-black/60 dark:text-white/60">
              See components in action • Click to explore details
            </p>
          </div>
          <Link
            href="/components"
            className="border-2 border-black dark:border-white px-4 py-2 text-sm font-mono transition-transform hover:scale-105 active:scale-95 hidden sm:block"
          >
            View All →
          </Link>
        </div>

        {loadingComps ? (
          <div className="space-y-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-2 border-black dark:border-white animate-pulse">
                <div className="p-5 border-b border-black dark:border-white">
                  <div className="h-8 bg-black/10 dark:bg-white/10 mb-3 w-1/3"></div>
                  <div className="h-4 bg-black/10 dark:bg-white/10 mb-2"></div>
                  <div className="h-4 bg-black/10 dark:bg-white/10 w-2/3"></div>
                </div>
                <div className="h-96 bg-black/5 dark:bg-white/5"></div>
              </div>
            ))}
          </div>
        ) : components.length === 0 ? (
          <div className="border-2 border-black dark:border-white p-12 text-center">
            <Palette className="w-16 h-16 mb-6 mx-auto stroke-1" />
            <div className="font-bold text-2xl mb-3">No components yet</div>
            <div className="text-sm text-black/60 dark:text-white/60 font-mono mb-8 max-w-md mx-auto">
              {isMember
                ? "Be the first to showcase your component with a live preview!"
                : "Join our community and start sharing your amazing components."}
            </div>
            {isMember ? (
              <Link
                href="/components/new"
                className="inline-block border-2 border-black dark:border-white px-6 py-3 text-sm font-mono bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95"
              >
                + Create First Component
              </Link>
            ) : (
              <a
                href={process.env.NEXT_PUBLIC_API_BASE + "/auth/github/login"}
                className="inline-block border-2 border-black dark:border-white px-6 py-3 text-sm font-mono bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95"
              >
                Get Started
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {components.slice(0, 6).map((c) => (
              <FeaturedComponentCard key={c.id || c.slug} component={c} />
            ))}

            {/* View All Button */}
            <div className="text-center pt-4">
              <Link
                href="/components"
                className="inline-block border-2 border-black dark:border-white px-8 py-4 text-sm font-mono transition-transform hover:scale-105 active:scale-95 bg-white text-black dark:bg-black dark:text-white"
              >
                Explore All {components.length} Components →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Improved Feature CTA Section */}
      {!isMember && components.length > 0 && (
        <section className="relative overflow-hidden border-2 border-black dark:border-white bg-grid-pattern p-12 md:p-20 text-center">
          <div className="absolute inset-0 bg-white/80 dark:bg-black/80 pointer-events-none"></div>
          <div className="relative z-10 max-w-3xl mx-auto space-y-6">
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">
              READY TO BUILD?
            </h2>
            <p className="text-lg font-mono text-black/80 dark:text-white/80 leading-relaxed font-bold">
              Join the open source community and start showcasing your UI components with live previews today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <a
                href={process.env.NEXT_PUBLIC_API_BASE + "/auth/github/login"}
                className="flex items-center justify-center gap-3 border-2 border-black dark:border-white px-8 py-4 bg-black text-white dark:bg-white dark:text-black font-mono font-bold text-sm transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                Sign in with GitHub
              </a>
              <a
                href="https://github.com/rishyym0927/StoreHUBX"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 border-2 border-black dark:border-white px-8 py-4 bg-white text-black dark:bg-black dark:text-white font-mono font-bold text-sm transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 active:translate-y-0 active:shadow-none"
              >
                <Star className="w-4 h-4" /> Star on GitHub
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
