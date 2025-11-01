import { RepoLink } from "@/types";

interface RepositoryInfoProps {
  repoLink: RepoLink;
}

export function RepositoryInfo({ repoLink }: RepositoryInfoProps) {
  if (!repoLink || !repoLink.owner || !repoLink.repo) {
    return null;
  }

  const repoUrl = `https://github.com/${repoLink.owner}/${repoLink.repo}`;
  const pathUrl = repoLink.path 
    ? `${repoUrl}/tree/${repoLink.ref || "main"}/${repoLink.path}`
    : repoUrl;

  return (
    <div className="space-y-3 pb-4 border-b border-black dark:border-white">
      <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider">
        GitHub Repository
      </div>

      {/* Repository Link */}
      <a
        href={repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <div className="flex items-center gap-2 font-mono text-sm hover:bg-black/5 dark:hover:bg-white/5 p-2 -mx-2 rounded transition-colors">
          <svg
            className="w-4 h-4 shrink-0"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path
              fillRule="evenodd"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          <span className="group-hover:underline break-all">
            {repoLink.owner}/{repoLink.repo}
          </span>
          <svg
            className="w-3 h-3 shrink-0 opacity-60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </div>
      </a>

      {/* Path Information */}
      {repoLink.path && (
        <a
          href={pathUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <div className="text-xs font-mono">
            <span className="text-black/60 dark:text-white/60">Path: </span>
            <span className="hover:underline break-all">{repoLink.path}</span>
          </div>
        </a>
      )}

      {/* Branch/Ref Information */}
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-black/60 dark:text-white/60">Branch:</span>
        <span className="font-bold">{repoLink.ref || "main"}</span>
      </div>

      {/* Commit Information */}
      {repoLink.commit && (
        <a
          href={`${repoUrl}/commit/${repoLink.commit}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <div className="flex items-center justify-between text-xs font-mono hover:bg-black/5 dark:hover:bg-white/5 p-2 -mx-2 rounded transition-colors">
            <span className="text-black/60 dark:text-white/60">Commit:</span>
            <span className="font-mono hover:underline">
              {repoLink.commit.substring(0, 7)}
            </span>
          </div>
        </a>
      )}
    </div>
  );
}
