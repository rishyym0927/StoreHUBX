"use client";

import { useState } from "react";

interface RepoOgBannerProps {
  owner: string;
  repo: string;
}

// GitHub's auto-generated social-preview image, used as an optional card
// banner (item 45) — no API call needed, just a public image URL. Hides
// itself on load failure so the card falls back to the plain text layout.
export function RepoOgBanner({ owner, repo }: RepoOgBannerProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div className="-mx-6 -mt-6 mb-2 border-b-2 border-black dark:border-white overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://opengraph.githubassets.com/1/${owner}/${repo}`}
        alt=""
        className="w-full h-32 object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
