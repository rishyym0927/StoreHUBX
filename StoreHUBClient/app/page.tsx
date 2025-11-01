"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/store";
import { componentApi, userApi, versionApi, previewApi } from "@/lib/api";
import { PreviewIframe } from "@/components/common/preview-iframe";
import { ComponentCard } from "@/components/common/component-card";
import type { Component, UserProfileResponse, ComponentVersion } from "@/types";

// Featured Component Card with Live Preview
function FeaturedComponentCard({ component }: { component: Component }) {
  const [showPreview, setShowPreview] = useState(false);
  const [latestVersion, setLatestVersion] = useState<ComponentVersion | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);

  // Fetch latest version when preview is shown
  useEffect(() => {
    if (showPreview && !latestVersion && !loadingVersion) {
      setLoadingVersion(true);
      versionApi.list(component.slug)
        .then((versions) => {
          if (versions && versions.length > 0) {
            setLatestVersion(versions[0]);
          }
        })
        .catch((err) => console.error("Failed to fetch versions:", err))
        .finally(() => setLoadingVersion(false));
    }
  }, [showPreview, component.slug, latestVersion, loadingVersion]);

  const previewUrl = latestVersion 
    ? (latestVersion.previewUrl || previewApi.getPreviewUrl(component.slug, latestVersion.version))
    : null;

  return (
    <div className="space-y-6">
      {/* Component Card */}
      <div className="border border-black dark:border-white transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]">
        <ComponentCard component={component} />
      </div>

      {/* Preview Toggle Buttn */}
      {/* <div className="flex justify-center">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="border-2 border-black dark:border-white px-8 py-3 font-mono text-sm font-bold transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 active:shadow-none inline-flex items-center gap-2"
        >
          {showPreview ? (
            <>
              <span>Hide Preview</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Show Live Preview</span>
            </>
          )}
        </button>
      </div> */}

      {/* Preview Section */}
      {showPreview && (
        <div className="border-2 border-black dark:border-white">
          {loadingVersion ? (
            <div className="p-16 text-center">
              <div className="inline-block w-8 h-8 border-4 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-4" />
              <div className="text-sm font-mono text-black/60 dark:text-white/60 font-bold">Loading preview...</div>
            </div>
          ) : previewUrl ? (
            <PreviewIframe url={previewUrl} height={600} />
          ) : (
            <div className="p-16 text-center">
              <div className="text-6xl mb-6">🎨</div>
              <div className="text-2xl font-bold mb-3">No Preview Available</div>
              <p className="text-sm font-mono text-black/60 dark:text-white/60 mb-8 max-w-md mx-auto">
                This component doesn&apos;t have a published version yet
              </p>
              <a
                href={`/components/${component.slug}`}
                className="inline-block border-2 border-black dark:border-white px-6 py-3 text-sm font-mono font-bold transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 active:shadow-none"
              >
                View Details →
              </a>
            </div>
          )}
        </div>
      )}
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
      {/* Compact Hero Section */}
      <section className="border-2 border-black dark:border-white p-4 md:p-6">
        {checking ? (
          <div className="text-center py-4">
            <div className="inline-block animate-pulse text-sm font-mono text-black/60 dark:text-white/60">
              Checking session…
            </div>
          </div>
        ) : isMember ? (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Welcome, {profile?.user?.name || profile?.user?.username || 'Developer'}
              </h1>
              <p className="text-xs font-mono text-black/60 dark:text-white/60 mt-1">
                Explore live component previews below
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/components/new"
                className="border-2 border-black dark:border-white px-3 py-1.5 font-mono text-xs bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95"
              >
                + Create
              </a>
              <a
                href="/components"
                className="border-2 border-black dark:border-white px-3 py-1.5 font-mono text-xs transition-transform hover:scale-105 active:scale-95"
              >
                Browse All
              </a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                StoreHUB<span className="text-black/40 dark:text-white/40">X</span>
              </h1>
              <p className="text-sm font-mono text-black/60 dark:text-white/60 mt-2">
                Preview UI components live • All frameworks • 100% open source
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={process.env.NEXT_PUBLIC_API_BASE + "/auth/github/login"}
                className="border-2 border-black dark:border-white px-3 py-1.5 font-mono text-xs bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95 inline-flex items-center gap-2"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                Sign in
              </a>
              <a
                href="/components"
                className="border-2 border-black dark:border-white px-3 py-1.5 font-mono text-xs transition-transform hover:scale-105 active:scale-95"
              >
                Explore
              </a>
            </div>
          </div>
        )}
      </section>

      {/* Quick Stats - Compact */}
      {components.length > 0 && (
        <section className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="border border-black dark:border-white p-3 md:p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold">{stats.totalComponents}</div>
            <div className="text-xs font-mono text-black/60 dark:text-white/60">Components</div>
          </div>
          <div className="border border-black dark:border-white p-3 md:p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold">{stats.frameworks}</div>
            <div className="text-xs font-mono text-black/60 dark:text-white/60">Frameworks</div>
          </div>
          <div className="border border-black dark:border-white p-3 md:p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold">{stats.linkedRepos}</div>
            <div className="text-xs font-mono text-black/60 dark:text-white/60">GitHub Linked</div>
          </div>
        </section>
      )}



      {/* Featured Component Previews - THE MAIN ATTRACTION */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-black dark:border-white pb-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-1">✨ Live Component Previews</h2>
            <p className="text-sm font-mono text-black/60 dark:text-white/60">
              See components in action • Click to explore details
            </p>
          </div>
          <a 
            href="/components" 
            className="border-2 border-black dark:border-white px-4 py-2 text-sm font-mono transition-transform hover:scale-105 active:scale-95 hidden sm:block"
          >
            View All →
          </a>
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
            <div className="text-6xl mb-6">🎨</div>
            <div className="font-bold text-2xl mb-3">No components yet</div>
            <div className="text-sm text-black/60 dark:text-white/60 font-mono mb-8 max-w-md mx-auto">
              {isMember 
                ? "Be the first to showcase your component with a live preview!" 
                : "Join our community and start sharing your amazing components."}
            </div>
            {isMember ? (
              <a
                href="/components/new"
                className="inline-block border-2 border-black dark:border-white px-6 py-3 text-sm font-mono bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95"
              >
                + Create First Component
              </a>
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
              <a 
                href="/components" 
                className="inline-block border-2 border-black dark:border-white px-8 py-4 text-sm font-mono transition-transform hover:scale-105 active:scale-95 bg-white text-black dark:bg-black dark:text-white"
              >
                Explore All {components.length} Components →
              </a>
            </div>
          </div>
        )}
      </section>

      {/* Compact CTA Section - Only for non-members */}
      {!isMember && components.length > 0 && (
        <section className="border-2 border-black dark:border-white p-6 md:p-8 text-center">
          <h2 className="text-xl md:text-2xl font-bold mb-2">
            Join the Community
          </h2>
          <p className="text-sm text-black/60 dark:text-white/60 font-mono mb-4 max-w-xl mx-auto">
            Share your components • Preview live • 100% open source
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href={process.env.NEXT_PUBLIC_API_BASE + "/auth/github/login"}
              className="border-2 border-black dark:border-white px-6 py-3 text-sm font-mono bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95 inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              Sign in with GitHub
            </a>
            <a
              href="https://github.com/rishyym0927/StoreHUBX"
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-black dark:border-white px-6 py-3 text-sm font-mono transition-transform hover:scale-105 active:scale-95 inline-flex items-center gap-2"
            >
              ⭐ Star on GitHub
            </a>
          </div>
        </section>
      )}
    </div>
  );
}