"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, isTokenValid } from "@/lib/store";
import { componentApi, userApi, GITHUB_LOGIN_URL, ApiError } from "@/lib/api";
import { ComponentCard } from "@/components/common/component-card";
import { ComponentCardSkeleton } from "@/components/common/component-card-skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { Sparkles, Star, Palette } from "lucide-react";
import type { Component, UserProfileResponse } from "@/types";

// Purely decorative — the band is aria-hidden, so this list is a visual motif
// rather than a claim about what's actually in the catalogue.
const MARQUEE_ITEMS = [
  "REACT",
  "NEXT.JS",
  "VITE",
  "SVELTE",
  "VUE",
  "TAILWIND",
  "HTML",
  "CSS",
  "ANGULAR",
  "SOLID",
];

// One scale for both hero variants — they share a min-height, so letting them
// differ only reintroduces the jump the min-height exists to prevent.
const HEADLINE =
  "text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[1.1] break-words";

const FEATURE_STATS = [
  {
    title: "Live Previews",
    body: "See exactly what you are getting. Every component supports an interactive live preview rendered securely.",
    label: "TOTAL COMPS",
  },
  {
    title: "Any Framework",
    body: "Tag and filter components by the framework of your choice. Find exactly what fits your tech stack.",
    label: "FRAMEWORKS",
  },
  {
    title: "GitHub Linked",
    body: "Link directly to your GitHub repository tags or branches to version your components automatically.",
    label: "LINKED REPOS",
  },
] as const;

function FeatureStat({
  index,
  title,
  body,
  value,
  label,
}: {
  index: number;
  title: string;
  body: string;
  value: number;
  label: string;
}) {
  return (
    <div className="p-8 space-y-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
      <div className="w-12 h-12 border-2 border-black dark:border-white flex items-center justify-center text-xl font-bold bg-white text-black dark:bg-black dark:text-white">
        {String(index + 1).padStart(2, "0")}
      </div>
      <h3 className="text-2xl font-bold uppercase tracking-tight">{title}</h3>
      <p className="font-mono text-sm text-black/70 dark:text-white/70">{body}</p>
      <div className="pt-4 border-t-2 border-black dark:border-white">
        <span className="text-4xl font-black">{value}</span>
        <span className="font-mono text-xs ml-2 text-black/60 dark:text-white/60">{label}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const token = useAuth((s) => s.token);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [checking, setChecking] = useState(true);

  const [components, setComponents] = useState<Component[]>([]);
  const [totalComponents, setTotalComponents] = useState(0);
  const [loadingComps, setLoadingComps] = useState(true);

  // Verify membership (only if we have a token in Zustand)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!token || !isTokenValid(token)) {
          if (mounted) {
            setProfile(null);
            setChecking(false);
          }
          return;
        }
        const profileData = await userApi.getProfile(token);
        if (mounted) setProfile(profileData);
      } catch (error) {
        // A 401 just means "not signed in" — SessionGuard already cleared the
        // stale token, so there's nothing to report here.
        if (!(error instanceof ApiError && error.status === 401)) {
          console.error("Error fetching profile:", error);
        }
        if (mounted) setProfile(null);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  // Load components (public). Fetch a page of 100 so the stats below reflect
  // the real catalogue rather than the handful shown; `total` is the server's
  // own count, so the component figure stays right past 100 either way.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await componentApi.list({ limit: 100, page: 1 });
        if (mounted) {
          setComponents(res.components || []);
          setTotalComponents(res.total ?? res.components?.length ?? 0);
        }
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

  // Stats. The component count is the server's total; the other two are
  // derived from the fetched page (capped at 100 above), which is exact at
  // the current catalogue size.
  const stats = useMemo(() => {
    const uniqueFrameworks = new Set<string>();
    components.forEach(c => c.frameworks?.forEach(fw => uniqueFrameworks.add(fw.toLowerCase())));
    return {
      totalComponents,
      frameworks: uniqueFrameworks.size,
      linkedRepos: components.filter(c => c.repoLink?.owner && c.repoLink?.repo).length
    };
  }, [components, totalComponents]);

  // Positional, matching FEATURE_STATS above.
  const statValues = [stats.totalComponents, stats.frameworks, stats.linkedRepos];

  return (
    <div className="space-y-8 sm:space-y-12 pb-12">
      {/* Massive Hero Section with Grid Pattern */}
      <section className="relative overflow-hidden border-2 border-black dark:border-white bg-grid-pattern p-8 md:p-16 lg:p-24 flex flex-col items-center text-center">
        <div className="absolute inset-0 bg-white/60 dark:bg-black/60 pointer-events-none"></div>
        {/* Fixed minimum height across all three states: the signed-in and
            signed-out headlines are different lengths, and without this the
            page visibly collapses when the session check resolves. */}
        <div className="relative z-10 w-full max-w-4xl min-h-[20rem] md:min-h-[24rem] flex flex-col justify-center space-y-6">
          {checking ? (
            <div className="space-y-6" aria-hidden="true">
              <div className="h-12 md:h-16 skeleton-shimmer w-3/4 mx-auto" />
              <div className="h-12 md:h-16 skeleton-shimmer w-1/2 mx-auto" />
              <div className="h-6 skeleton-shimmer w-2/3 mx-auto" />
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <div className="h-14 w-full sm:w-56 skeleton-shimmer" />
                <div className="h-14 w-full sm:w-56 skeleton-shimmer" />
              </div>
            </div>
          ) : isMember ? (
            <div className="space-y-6">
              <h1 className={HEADLINE}>
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
                  className="brutal-lift brutal-lift-lg border-2 border-black dark:border-white px-8 py-4 font-mono font-bold text-sm bg-black text-white dark:bg-white dark:text-black"
                >
                  + CREATE COMPONENT
                </Link>
                <Link
                  href="/components"
                  className="brutal-lift brutal-lift-lg border-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white px-8 py-4 font-mono font-bold text-sm"
                >
                  BROWSE ALL
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <h1 className={HEADLINE}>
                BUILD UI <br />
                <span className="bg-black text-white dark:bg-white dark:text-black px-4 block sm:inline-block">FASTER.</span>
              </h1>
              <p className="text-lg md:text-xl font-mono text-black/80 dark:text-white/80 max-w-2xl mx-auto font-bold">
                The open source registry for sharing and discovering UI components across all frameworks.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <a
                  href={GITHUB_LOGIN_URL}
                  className="brutal-lift brutal-lift-lg flex items-center justify-center gap-3 border-2 border-black dark:border-white px-8 py-4 bg-black text-white dark:bg-white dark:text-black font-mono font-bold text-sm"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  SIGN IN WITH GITHUB
                </a>
                <Link
                  href="/components"
                  className="brutal-lift brutal-lift-lg border-2 border-black dark:border-white bg-white text-black dark:bg-black dark:text-white px-8 py-4 font-mono font-bold text-sm"
                >
                  EXPLORE COMPONENTS
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Infinite Marquee Section. Decorative only — hidden from screen
          readers, which would otherwise announce the list twice. */}
      <section
        aria-hidden="true"
        className="border-2 border-black dark:border-white overflow-hidden py-3 bg-white text-black dark:bg-black dark:text-white"
      >
        <div className="flex w-max animate-marquee space-x-8 items-center font-mono font-black text-xl uppercase tracking-widest whitespace-nowrap">
          {/* Rendered twice so the -100% translate loops seamlessly. */}
          {[0, 1].map((copy) => (
            <div key={copy} className="flex space-x-8 items-center px-4">
              {MARQUEE_ITEMS.map((item) => (
                <Fragment key={item}>
                  <span>{item}</span>
                  <span className="text-black/30 dark:text-white/30">•</span>
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Why StoreHUBX / Stats Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-0 border-2 border-black dark:border-white divide-y-2 md:divide-y-0 md:divide-x-2 divide-black dark:divide-white">
        {FEATURE_STATS.map((feature, i) => (
          <FeatureStat
            key={feature.title}
            index={i}
            title={feature.title}
            body={feature.body}
            value={statValues[i]}
            label={feature.label}
          />
        ))}
      </section>

      {/* Latest components */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-black dark:border-white pb-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-1 flex items-center gap-2">
              <Sparkles className="w-7 h-7 sm:w-8 sm:h-8" /> Latest Components
            </h2>
            <p className="text-sm font-mono text-black/60 dark:text-white/60">
              Recently updated across every framework
            </p>
          </div>
          <Link
            href="/components"
            className="brutal-scale border-2 border-black dark:border-white px-4 py-2 text-sm font-mono hidden sm:block"
          >
            View All →
          </Link>
        </div>

        {loadingComps ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <ComponentCardSkeleton key={i} />
            ))}
          </div>
        ) : components.length === 0 ? (
          <EmptyState
            icon={Palette}
            size="lg"
            title="No components yet"
            description={
              isMember
                ? "Be the first to showcase your component with a live preview!"
                : "Join our community and start sharing your amazing components."
            }
            action={
              isMember ? (
                <Link
                  href="/components/new"
                  className="brutal-scale inline-block border-2 border-black dark:border-white px-6 py-3 text-sm font-mono bg-black text-white dark:bg-white dark:text-black"
                >
                  + Create First Component
                </Link>
              ) : (
                <a
                  href={GITHUB_LOGIN_URL}
                  className="brutal-scale inline-block border-2 border-black dark:border-white px-6 py-3 text-sm font-mono bg-black text-white dark:bg-white dark:text-black"
                >
                  Get Started
                </a>
              )
            }
          />
        ) : (
          <div className="space-y-8">
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {components.slice(0, 6).map((c, i) => (
                <div key={c.id || c.slug} className="stagger-in h-full" style={{ "--stagger-index": i } as React.CSSProperties}>
                  <ComponentCard component={c} />
                </div>
              ))}
            </div>

            {/* View All Button */}
            <div className="text-center pt-4">
              <Link
                href="/components"
                className="brutal-scale inline-block border-2 border-black dark:border-white px-8 py-4 text-sm font-mono bg-white text-black dark:bg-black dark:text-white"
              >
                Explore All {stats.totalComponents} Components →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* The hero already carries the sign-in CTA, so this is just the repo
          link rather than a second full-height pitch saying the same thing. */}
      <section className="border-2 border-black dark:border-white px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <p className="font-mono text-sm text-black/70 dark:text-white/70">
          StoreHUBX is open source.
        </p>
        <a
          href="https://github.com/rishyym0927/StoreHUBX"
          target="_blank"
          rel="noopener noreferrer"
          className="brutal-scale flex items-center gap-2 border-2 border-black dark:border-white px-4 py-2 font-mono font-bold text-xs uppercase tracking-wider"
        >
          <Star className="w-3.5 h-3.5" /> Star on GitHub
        </a>
      </section>
    </div>
  );
}
