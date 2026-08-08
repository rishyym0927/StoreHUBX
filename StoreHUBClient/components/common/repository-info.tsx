import { RepoLink, GitHubRepoInfo, GitHubLanguages, GitHubLatestCommit, GitHubContributor } from "@/types";
import { formatRelativeTime } from "@/lib/api-utils";
import { Star, GitFork, CircleDot } from "lucide-react";

interface RepositoryInfoProps {
  repoLink: RepoLink;
  repoInfo?: GitHubRepoInfo | null;
  languages?: GitHubLanguages | null;
  latestCommit?: GitHubLatestCommit | null;
  contributors?: GitHubContributor[] | null;
}

// Grayscale shades only, consistent with the black/white palette — cycled
// across however many languages a repo reports.
const LANGUAGE_SHADES = [
  "bg-black dark:bg-white",
  "bg-black/70 dark:bg-white/70",
  "bg-black/45 dark:bg-white/45",
  "bg-black/25 dark:bg-white/25",
  "bg-black/12 dark:bg-white/12",
];

export function RepositoryInfo({ repoLink, repoInfo, languages, latestCommit, contributors }: RepositoryInfoProps) {
  if (!repoLink || !repoLink.owner || !repoLink.repo) {
    return null;
  }

  const repoUrl = `https://github.com/${repoLink.owner}/${repoLink.repo}`;
  const pathUrl = repoLink.path
    ? `${repoUrl}/tree/${repoLink.ref || "main"}/${repoLink.path}`
    : repoUrl;

  const languageEntries = languages
    ? Object.entries(languages).sort((a, b) => b[1] - a[1])
    : [];
  const languageTotal = languageEntries.reduce((sum, [, bytes]) => sum + bytes, 0);

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

      {/* Repo stats (item 39) */}
      {repoInfo && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
          <span className="flex items-center gap-1" title="Stars">
            <Star className="w-3.5 h-3.5" /> {repoInfo.stars}
          </span>
          <span className="flex items-center gap-1" title="Forks">
            <GitFork className="w-3.5 h-3.5" /> {repoInfo.forks}
          </span>
          <span className="flex items-center gap-1" title="Open issues">
            <CircleDot className="w-3.5 h-3.5" /> {repoInfo.openIssues}
          </span>
          {repoInfo.license?.spdxId && repoInfo.license.spdxId !== "NOASSERTION" && (
            <span className="text-black/60 dark:text-white/60">{repoInfo.license.spdxId}</span>
          )}
        </div>
      )}

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

      {/* Latest commit (item 42) — real message + relative time when available,
          falling back to the bare SHA if the enrichment fetch didn't resolve. */}
      {latestCommit ? (
        <a
          href={latestCommit.htmlUrl || `${repoUrl}/commit/${latestCommit.sha}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
          title={latestCommit.sha}
        >
          <div className="text-xs font-mono hover:bg-black/5 dark:hover:bg-white/5 p-2 -mx-2 rounded transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-bold hover:underline">
                {latestCommit.message.split("\n")[0]}
              </span>
              <span className="shrink-0 text-black/60 dark:text-white/60">
                {latestCommit.sha.substring(0, 7)}
              </span>
            </div>
            <div className="text-black/60 dark:text-white/60 mt-0.5">
              {latestCommit.authorName}
              {latestCommit.date && ` · ${formatRelativeTime(latestCommit.date)}`}
            </div>
          </div>
        </a>
      ) : (
        repoLink.commit && (
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
        )
      )}

      {/* Language breakdown bar (item 41) */}
      {languageEntries.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider">
            Languages
          </div>
          <div className="flex h-2 w-full overflow-hidden border border-black dark:border-white">
            {languageEntries.map(([lang, bytes], i) => (
              <div
                key={lang}
                className={LANGUAGE_SHADES[i % LANGUAGE_SHADES.length]}
                style={{ width: `${(bytes / languageTotal) * 100}%` }}
                title={`${lang}: ${((bytes / languageTotal) * 100).toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-black/60 dark:text-white/60">
            {languageEntries.slice(0, 5).map(([lang, bytes]) => (
              <span key={lang}>
                {lang} {((bytes / languageTotal) * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Contributor avatar stack (item 43) */}
      {contributors && contributors.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider">
            Contributors
          </div>
          <a
            href={`${repoUrl}/graphs/contributors`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center -space-x-2"
          >
            {contributors.slice(0, 8).map((c) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={c.login}
                src={c.avatarUrl}
                alt={c.login}
                title={`${c.login} (${c.contributions} commits)`}
                className="w-6 h-6 border-2 border-white dark:border-black bg-black/10 dark:bg-white/10 object-cover"
              />
            ))}
            {contributors.length > 8 && (
              <span className="flex items-center justify-center w-6 h-6 border-2 border-white dark:border-black bg-black text-white dark:bg-white dark:text-black text-[9px] font-bold">
                +{contributors.length - 8}
              </span>
            )}
          </a>
        </div>
      )}
    </div>
  );
}
