"use client";

import { CopyButton } from "@/components/common/copy-button";
import { RepoLink } from "@/types";

interface InstallCommandProps {
  repoLink?: RepoLink;
}

export function InstallCommand({ repoLink }: InstallCommandProps) {
  if (!repoLink || !repoLink.owner || !repoLink.repo) {
    return null;
  }

  const command = `git clone https://github.com/${repoLink.owner}/${repoLink.repo}.git`;

  return (
    <div className="space-y-2 pb-4 border-b border-black dark:border-white">
      <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider">
        Clone Repository
      </div>
      <div className="relative group">
        <div className="font-mono text-xs bg-black dark:bg-white text-white dark:text-black p-3 pr-24 rounded border border-black dark:border-white overflow-x-auto">
          {command}
        </div>
        <CopyButton value={command} />
      </div>
    </div>
  );
}
