"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/store";
import { githubApi, componentApi } from "@/lib/api";
import { useGitHubRepos, useGitHubBranches } from "@/hooks/use-api";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  File,
  Folder,
  FolderOpen,
  GitBranch,
  Link2,
  Plus,
  Search,
} from "lucide-react";
import { useToast } from "@/components/common/toast";
import type { GitHubRepo, GitHubContent } from "@/types";

type BrowserStep = "select-repo" | "browse-folders" | "confirm";

function GithubMark({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5z" />
    </svg>
  );
}

interface GithubBrowserProps {
  slug: string;
  initialOwner?: string;
  initialRepo?: string;
  initialRef?: string;
}

export function GithubBrowser({ slug, initialOwner, initialRepo, initialRef }: GithubBrowserProps) {
  const token = useAuth((s) => s.token);
  const { showToast } = useToast();
  const { data: repos, loading: loadingRepos } = useGitHubRepos();
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [ref, setRef] = useState("main");
  const [preselectApplied, setPreselectApplied] = useState(false);
  const [path, setPath] = useState("");
  const [currentSha, setCurrentSha] = useState("");
  const [entries, setEntries] = useState<GitHubContent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<BrowserStep>("select-repo");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const canBrowse = owner && repo;

  // Fetch branches when a repo is selected
  const { data: branches, loading: loadingBranches } = useGitHubBranches(owner, repo);

  // Close branch dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.branch-dropdown-container')) {
        setShowBranchDropdown(false);
      }
    };

    if (showBranchDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showBranchDropdown]);

  // Filtered repos based on search
  const filteredRepos = useMemo(() => {
    if (!repos || !searchTerm) return repos || [];
    const lower = searchTerm.toLowerCase();
    return repos.filter(r =>
      r.full_name.toLowerCase().includes(lower) ||
      r.name.toLowerCase().includes(lower)
    );
  }, [repos, searchTerm]);

  // When selecting a repo, automatically use its default branch
  const onSelectRepo = (r: GitHubRepo) => {
    setSelectedRepo(r);
    setOwner(r.owner.login);
    setRepo(r.name);
    setRef(r.default_branch || "main");
    setPath("");
    setEntries(null);
    setStep("browse-folders");

    // Item 46: suggest the repo's GitHub topics as one-click-add tags.
    setSuggestedTopics([]);
    setSelectedTags([]);
    githubApi
      .getRepoInfo({ owner: r.owner.login, repo: r.name })
      .then((info) => setSuggestedTopics(info.topics || []))
      .catch(() => {
        // Best-effort — no suggestions if this fails, linking still works.
      });
  };

  const toggleSuggestedTag = (topic: string) => {
    setSelectedTags((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  // Skip step 1 when arriving with a repo already chosen elsewhere (e.g. the
  // "From GitHub" flow on the new-component page) so the user isn't asked to
  // pick the same repo twice. Falls back to a manual (non-listed) selection
  // if the repo isn't in the first page of `useGitHubRepos` results.
  useEffect(() => {
    if (preselectApplied || !initialOwner || !initialRepo || loadingRepos) return;
    setPreselectApplied(true);

    const found = repos?.find(
      (r) => r.owner.login === initialOwner && r.name === initialRepo
    );
    if (found) {
      onSelectRepo(found);
    } else {
      setSelectedRepo({
        id: 0,
        name: initialRepo,
        full_name: `${initialOwner}/${initialRepo}`,
        private: false,
        html_url: `https://github.com/${initialOwner}/${initialRepo}`,
        owner: { login: initialOwner, id: 0 },
        default_branch: initialRef || "main",
      });
      setOwner(initialOwner);
      setRepo(initialRepo);
      setRef(initialRef || "main");
      setPath("");
      setEntries(null);
      setStep("browse-folders");
    }
    if (initialRef) setRef(initialRef);
  }, [repos, loadingRepos, preselectApplied, initialOwner, initialRepo, initialRef]);

  // List contents for current path
  const listContents = async (nextPath: string) => {
    if (!canBrowse || !token) return;

    setLoading(true);
    try {
      const files = await githubApi.getContents({
        owner,
        repo,
        path: nextPath,
        ref: ref || "main",
      }, token);

      // Fetch the latest commit SHA for the branch
      const branchSha = await fetchBranchSha();
      setCurrentSha(branchSha);

      setEntries(files);
      setPath(nextPath);
    } catch (e) {
      console.error("Failed to load contents:", e);
      showToast("Failed to load folder contents. Please check the branch/path.", "error");
    } finally {
      setLoading(false);
    }
  };

const fetchBranchSha = async () => {
  if (!token) return "";

  try {
    const branch = await githubApi.getBranch({
      owner,
      repo,
      branch: ref || "main"
    }, token);

    return branch.commit.sha || "";
  } catch (e) {
    console.error("Failed to fetch branch SHA:", e);
    return "";
  }
};
  const crumbs = useMemo(() => {
    const parts = path ? path.split("/") : [];
    const acc: { label: string; path: string }[] = [{ label: repo || "repo", path: "" }];
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      acc.push({ label: p, path: cur });
    }
    return acc;
  }, [path, repo]);

  const onSubmit = async () => {
    if (!owner || !repo || !token) return;

    const payload = { owner, repo, path, ref, commit: currentSha, tags: selectedTags };

    setSubmitting(true);
    try {
      const response = await componentApi.link(slug, payload, token);

      // Show success message if initial version was created
      if (response.initialVersion) {
        showToast(
          `Repository linked! Initial version ${response.initialVersion.version} created and build queued.`,
          "success"
        );
        setTimeout(() => {
          window.location.href = `/components/${slug}`;
        }, 1200);
      } else {
        window.location.href = `/components/${slug}`;
      }
    } catch (e) {
      console.error("Link submit failed:", e);
      showToast("Failed to link folder. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (step === "browse-folders") {
      setStep("select-repo");
      setSelectedRepo(null);
      setOwner("");
      setRepo("");
      setPath("");
      setEntries(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 border-2 text-xs font-mono font-bold uppercase tracking-wide ${
            step === "select-repo"
              ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
              : "border-black/30 dark:border-white/30 text-black/50 dark:text-white/50"
          }`}
        >
          <span className="w-4 h-4 flex items-center justify-center border border-current text-[10px]">1</span>
          Select Repository
        </div>
        <div className="flex-1 h-px bg-black/20 dark:bg-white/20" />
        <div
          className={`flex items-center gap-2 px-3 py-1.5 border-2 text-xs font-mono font-bold uppercase tracking-wide ${
            step === "browse-folders"
              ? "border-black dark:border-white bg-black text-white dark:bg-white dark:text-black"
              : "border-black/30 dark:border-white/30 text-black/50 dark:text-white/50"
          }`}
        >
          <span className="w-4 h-4 flex items-center justify-center border border-current text-[10px]">2</span>
          Browse &amp; Link Folder
        </div>
      </div>

      {!token ? (
        <div className="p-6 border-2 border-yellow-600 dark:border-yellow-400 bg-yellow-50 dark:bg-yellow-950">
          <p className="text-sm font-mono font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Authentication Required</p>
          <p className="text-sm font-mono mt-1 opacity-80">Please log in with GitHub to browse repositories.</p>
        </div>
      ) : (
        <>
          {/* STEP 1: Select Repository */}
          {step === "select-repo" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Choose a GitHub Repository</h2>
                <p className="text-sm font-mono text-black/60 dark:text-white/60">Select the repository that contains your component.</p>
              </div>

              {loadingRepos ? (
                <div className="p-8 border-2 border-dashed border-black/30 dark:border-white/30 text-center">
                  <div className="inline-block w-8 h-8 border-4 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm font-mono text-black/60 dark:text-white/60">Loading your repositories...</p>
                </div>
              ) : (
                <>
                  {/* Search bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input
                      type="text"
                      placeholder="Search repositories..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-4 py-3 pl-10 border-2 border-black dark:border-white bg-transparent font-mono text-sm focus:outline-none"
                    />
                  </div>

                  {/* Repository list */}
                  {filteredRepos.length === 0 ? (
                    <div className="p-8 border-2 border-dashed border-black/30 dark:border-white/30 text-center">
                      <p className="text-sm font-mono text-black/60 dark:text-white/60">
                        {searchTerm ? "No repositories match your search." : "No repositories found."}
                      </p>
                    </div>
                  ) : (
                    <div className="border-2 border-black dark:border-white divide-y divide-black/20 dark:divide-white/20 max-h-[400px] overflow-y-auto">
                      {filteredRepos.map((r) => (
                        <button
                          key={r.full_name}
                          onClick={() => onSelectRepo(r)}
                          className="w-full text-left p-4 hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <GithubMark className="w-4 h-4 shrink-0 opacity-60" />
                            <span className="font-mono text-sm truncate">{r.full_name}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* STEP 2: Browse Folders */}
          {step === "browse-folders" && selectedRepo && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold mb-1">Browse Repository</h2>
                  <p className="text-sm font-mono text-black/60 dark:text-white/60">Navigate to the folder containing your component files.</p>
                </div>
                <button
                  onClick={goBack}
                  className="shrink-0 px-4 py-2 text-xs font-mono font-bold uppercase border-2 border-black dark:border-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  ← Change Repo
                </button>
              </div>

              {/* Repository info card */}
              <div className="p-4 border-2 border-black dark:border-white">
                <div className="flex items-center gap-2 mb-3">
                  <GithubMark className="w-4 h-4 opacity-60" />
                  <span className="font-mono font-bold text-sm">{selectedRepo.full_name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase text-black/50 dark:text-white/50">Branch:</span>
                    <div className="relative branch-dropdown-container">
                      <button
                        onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                        className="px-3 py-1.5 border-2 border-black dark:border-white text-sm font-mono flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      >
                        <GitBranch className="w-3.5 h-3.5 opacity-60" />
                        {ref}
                        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                      </button>

                      {showBranchDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-black border-2 border-black dark:border-white z-10 max-h-64 overflow-y-auto">
                          {loadingBranches ? (
                            <div className="p-4 text-center">
                              <div className="inline-block w-4 h-4 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
                              <p className="text-xs font-mono mt-2 opacity-70">Loading branches...</p>
                            </div>
                          ) : branches && branches.length > 0 ? (
                            <>
                              {branches.map((branch) => (
                                <button
                                  key={branch.name}
                                  onClick={() => {
                                    setRef(branch.name);
                                    setShowBranchDropdown(false);
                                    setPath("");
                                    setEntries(null);
                                  }}
                                  className={`w-full text-left px-4 py-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-between ${
                                    ref === branch.name ? 'bg-black/10 dark:bg-white/15' : ''
                                  }`}
                                >
                                  <span className="font-mono text-sm">{branch.name}</span>
                                  {ref === branch.name && <Check className="w-4 h-4" />}
                                </button>
                              ))}
                            </>
                          ) : (
                            <div className="p-4 text-center text-sm font-mono opacity-70">
                              No branches found
                            </div>
                          )}
                          <div className="border-t border-black/20 dark:border-white/20 p-2">
                            <input
                              type="text"
                              placeholder="Or type branch/tag..."
                              value={ref}
                              onChange={(e) => setRef(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setShowBranchDropdown(false);
                                  setPath("");
                                  setEntries(null);
                                }
                              }}
                              className="w-full px-2 py-1 text-xs font-mono border border-black/40 dark:border-white/40 bg-transparent focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowBranchDropdown(false);
                      listContents("");
                    }}
                    className="px-3 py-1.5 border-2 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black text-sm font-mono font-bold inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                  >
                    <FolderOpen className="w-4 h-4" /> Browse Root
                  </button>
                </div>
              </div>

              {/* Breadcrumbs */}
              {entries && (
                <div className="flex items-center gap-2 text-sm border-2 border-black dark:border-white px-4 py-3">
                  <span className="text-xs font-mono uppercase text-black/50 dark:text-white/50">Path:</span>
                  {crumbs.map((c, i) => (
                    <span key={c.path} className="flex items-center gap-2">
                      <button
                        className="font-mono font-medium hover:opacity-60 transition-opacity"
                        onClick={() => listContents(c.path)}
                      >
                        {c.label}
                      </button>
                      {i < crumbs.length - 1 && <span className="opacity-30">/</span>}
                    </span>
                  ))}
                </div>
              )}

              {/* Folder contents */}
              <div className="border-2 border-black dark:border-white overflow-hidden">
                {loading ? (
                  <div className="p-12 text-center">
                    <div className="inline-block w-8 h-8 border-4 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm font-mono text-black/60 dark:text-white/60">Loading contents...</p>
                  </div>
                ) : entries === null ? (
                  <div className="p-12 text-center border-2 border-dashed border-black/30 dark:border-white/30 m-4">
                    <Folder className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-mono text-black/60 dark:text-white/60 mb-2">Click &quot;Browse Root&quot; to start exploring</p>
                    <p className="text-xs font-mono opacity-50">You can navigate to the folder containing your component</p>
                  </div>
                ) : entries.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-mono text-black/60 dark:text-white/60">This folder is empty</p>
                  </div>
                ) : (
                  <div className="divide-y divide-black/20 dark:divide-white/20 max-h-[400px] overflow-y-auto">
                    {entries.map((e) => (
                      <div
                        key={e.path}
                        className="flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {e.type === "dir" ? (
                            <Folder className="w-4 h-4 shrink-0 opacity-70" />
                          ) : (
                            <File className="w-4 h-4 shrink-0 opacity-40" />
                          )}
                          <span className="font-mono text-sm truncate">{e.name}</span>
                        </div>
                        {e.type === "dir" && (
                          <button
                            onClick={() => listContents(e.path)}
                            className="px-3 py-1.5 text-xs font-mono font-bold uppercase border-2 border-black dark:border-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                          >
                            Open →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Item 46: GitHub topic tag suggestions */}
              {suggestedTopics.length > 0 && (
                <div className="p-4 border-2 border-black dark:border-white space-y-2">
                  <p className="text-xs font-mono font-bold uppercase tracking-wide">Suggested tags from GitHub topics</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedTopics.map((topic) => {
                      const isSelected = selectedTags.includes(topic);
                      return (
                        <button
                          key={topic}
                          type="button"
                          onClick={() => toggleSuggestedTag(topic)}
                          className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-mono border-2 transition-colors ${
                            isSelected
                              ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                              : "border-black/40 dark:border-white/40 hover:border-black dark:hover:border-white"
                          }`}
                        >
                          {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          {topic}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Link button */}
              <div className="flex items-center justify-between gap-4 p-4 border-2 border-black dark:border-white">
                <div>
                  <p className="font-bold">Ready to link?</p>
                  <p className="text-sm font-mono text-black/60 dark:text-white/60">
                    {path
                      ? `Link the folder: ${path}`
                      : "Link the repository root folder"
                    }
                  </p>
                </div>
                <button
                  disabled={!canBrowse || submitting}
                  onClick={onSubmit}
                  className="brutal-lift shrink-0 px-6 py-3 border-2 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-mono font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin" />
                      Linking...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Link This Folder</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
