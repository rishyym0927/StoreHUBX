"use client";

import { useState } from "react";
import { RepoLink } from "@/types";

interface InstallCommandProps {
  repoLink?: RepoLink;
}

export function InstallCommand({ repoLink }: InstallCommandProps) {
  const [copied, setCopied] = useState(false);

  if (!repoLink || !repoLink.owner || !repoLink.repo) {
    return null;
  }

  const command = `git clone https://github.com/${repoLink.owner}/${repoLink.repo}.git`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="space-y-2 pb-4 border-b border-black dark:border-white">
      <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider">
        Clone Repository
      </div>
      <div className="relative group">
        <div className="font-mono text-xs bg-black dark:bg-white text-white dark:text-black p-3 pr-20 rounded border border-black dark:border-white overflow-x-auto">
          {command}
        </div>
        <button
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-mono border border-white dark:border-black bg-white dark:bg-black text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="Copy to clipboard"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
