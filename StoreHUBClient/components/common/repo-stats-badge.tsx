"use client";

import { useEffect, useState } from "react";
import { Star, GitFork } from "lucide-react";
import { githubApi } from "@/lib/api";

interface RepoStatsBadgeProps {
  owner: string;
  repo: string;
}

type Stats = { stars: number; forks: number };

// Module-level cache shared by every mounted badge so a browse page with N
// cards for the same (or repeated) repo fires one request, not N.
const statsCache = new Map<string, Promise<Stats>>();

function fetchRepoStats(owner: string, repo: string): Promise<Stats> {
  const key = `${owner}/${repo}`;
  let pending = statsCache.get(key);
  if (!pending) {
    pending = githubApi
      .getRepoInfo({ owner, repo })
      .then((info) => ({ stars: info.stars, forks: info.forks }));
    pending.catch(() => statsCache.delete(key)); // don't cache failures
    statsCache.set(key, pending);
  }
  return pending;
}

// Small client island so component-card.tsx (used in server-rendered lists)
// can stay a plain component while this one fetches its own cached repo
// stats — public endpoint, no auth required (see lib/api.ts githubApi).
export function RepoStatsBadge({ owner, repo }: RepoStatsBadgeProps) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRepoStats(owner, repo)
      .then((info) => {
        if (!cancelled) setStats(info);
      })
      .catch(() => {
        // Decorative badge — fail silently, LINKED badge already covers status.
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  if (!stats) return null;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border border-black dark:border-white text-xs font-mono">
      <span className="flex items-center gap-1" title="Stars">
        <Star className="w-3 h-3" /> {stats.stars}
      </span>
      <span className="flex items-center gap-1" title="Forks">
        <GitFork className="w-3 h-3" /> {stats.forks}
      </span>
    </div>
  );
}
