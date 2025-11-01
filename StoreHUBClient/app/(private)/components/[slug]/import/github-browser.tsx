"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/store";
import { githubApi, componentApi } from "@/lib/api";
import { useGitHubRepos, useGitHubBranches } from "@/hooks/use-api";
import type { GitHubRepo, GitHubContent } from "@/types";

type BrowserStep = "select-repo" | "browse-folders" | "confirm";

export function GithubBrowser({ slug }: { slug: string }) {
  const token = useAuth((s) => s.token);
  const { data: repos, loading: loadingRepos } = useGitHubRepos();
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [ref, setRef] = useState("main");
  const [path, setPath] = useState("");
  const [currentSha, setCurrentSha] = useState("");
  const [entries, setEntries] = useState<GitHubContent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<BrowserStep>("select-repo");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
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
  };

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
      
      console.log("Loaded contents:", files);

      // Fetch the latest commit SHA for the branch
      const branchSha = await fetchBranchSha();
      console.log("Fetched branch SHA:", branchSha);
      setCurrentSha(branchSha);
      
      setEntries(files);
      setPath(nextPath);
      console.log("Set path to:", nextPath, "SHA to:", branchSha);
    } catch (e) {
      console.error("Failed to load contents:", e);
      alert("Failed to load folder contents. Please check the branch/path.");
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
    
    console.log("Branch API response:", branch);
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
    
    const payload = { owner, repo, path, ref, commit: currentSha };
    console.log("Submitting link payload:", payload);
    
    setSubmitting(true);
    try {
      const response = await componentApi.link(slug, payload, token);
      console.log("Link response:", response);
      
      // Show success message if initial version was created
      if (response.initialVersion) {
        alert(`✓ Repository linked successfully!\n\nInitial version ${response.initialVersion.version} has been created and build is queued.`);
      }
      
      window.location.href = `/components/${slug}`;
    } catch (e) {
      console.error("Link submit failed:", e);
      alert("Failed to link folder. Please try again.");
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
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
          step === "select-repo" 
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium" 
            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
        }`}>
          <span className="w-6 h-6 rounded-full bg-current text-white dark:text-gray-900 flex items-center justify-center text-xs font-bold">1</span>
          Select Repository
        </div>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
          step === "browse-folders" 
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium" 
            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
        }`}>
          <span className="w-6 h-6 rounded-full bg-current text-white dark:text-gray-900 flex items-center justify-center text-xs font-bold">2</span>
          Browse & Link Folder
        </div>
      </div>

      {!token ? (
        <div className="p-6 border-2 border-yellow-300 dark:border-yellow-700 rounded-xl bg-yellow-50 dark:bg-yellow-900/20">
          <p className="text-sm font-medium">⚠️ Authentication Required</p>
          <p className="text-sm mt-1 opacity-80">Please log in with GitHub to browse repositories.</p>
        </div>
      ) : (
        <>
          {/* STEP 1: Select Repository */}
          {step === "select-repo" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-1">Choose a GitHub Repository</h2>
                <p className="text-sm opacity-70">Select the repository that contains your component.</p>
              </div>

              {loadingRepos ? (
                <div className="p-8 border-2 border-dashed rounded-xl text-center">
                  <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm opacity-70">Loading your repositories...</p>
                </div>
              ) : (
                <>
                  {/* Search bar */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search repositories..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-4 py-3 pl-10 border-2 rounded-xl bg-transparent focus:border-blue-500 focus:outline-none"
                    />
                    <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  {/* Repository list */}
                  {filteredRepos.length === 0 ? (
                    <div className="p-8 border-2 border-dashed rounded-xl text-center">
                      <p className="text-sm opacity-70">
                        {searchTerm ? "No repositories match your search." : "No repositories found."}
                      </p>
                    </div>
                  ) : (
                    <div className="border-2 rounded-xl divide-y max-h-[400px] overflow-y-auto">
                      {filteredRepos.map((r) => (
                        <button
                          key={r.full_name}
                          onClick={() => onSelectRepo(r)}
                          className="w-full text-left p-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3">
                            <svg className="w-5 h-5 opacity-50" fill="currentColor" viewBox="0 0 16 16">
                              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5z"/>
                            </svg>
                            <span className="font-medium">{r.full_name}</span>
                          </div>
                          <svg className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
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
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold mb-1">Browse Repository</h2>
                  <p className="text-sm opacity-70">Navigate to the folder containing your component files.</p>
                </div>
                <button
                  onClick={goBack}
                  className="px-4 py-2 text-sm border-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  ← Change Repo
                </button>
              </div>

              {/* Repository info card */}
              <div className="p-4 bg-linear-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5z"/>
                  </svg>
                  <span className="font-semibold text-blue-900 dark:text-blue-100">{selectedRepo.full_name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="opacity-70">Branch:</span>
                    <div className="relative branch-dropdown-container">
                      <button
                        onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                        className="px-3 py-1.5 bg-white/50 dark:bg-black/20 border rounded-lg text-sm font-mono flex items-center gap-2 hover:bg-white/80 dark:hover:bg-black/30 transition-colors"
                      >
                        <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                        {ref}
                        <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {showBranchDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 border-2 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                          {loadingBranches ? (
                            <div className="p-4 text-center">
                              <div className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              <p className="text-xs mt-2 opacity-70">Loading branches...</p>
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
                                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-between ${
                                    ref === branch.name ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                                  }`}
                                >
                                  <span className="font-mono text-sm">{branch.name}</span>
                                  {ref === branch.name && (
                                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </>
                          ) : (
                            <div className="p-4 text-center text-sm opacity-70">
                              No branches found
                            </div>
                          )}
                          <div className="border-t p-2">
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
                              className="w-full px-2 py-1 text-xs border rounded bg-transparent"
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
                    className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    📂 Browse Root
                  </button>
                </div>
              </div>

              {/* Breadcrumbs */}
              {entries && (
                <div className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-900/50 px-4 py-3 rounded-lg border">
                  <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="opacity-70">Path:</span>
                  {crumbs.map((c, i) => (
                    <span key={c.path} className="flex items-center gap-2">
                      <button
                        className="font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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
              <div className="border-2 rounded-xl overflow-hidden">
                {loading ? (
                  <div className="p-12 text-center">
                    <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm opacity-70">Loading contents...</p>
                  </div>
                ) : entries === null ? (
                  <div className="p-12 text-center border-2 border-dashed rounded-xl m-4">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <p className="text-sm opacity-70 mb-2">Click "Browse Root" to start exploring</p>
                    <p className="text-xs opacity-50">You can navigate to the folder containing your component</p>
                  </div>
                ) : entries.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm opacity-70">This folder is empty</p>
                  </div>
                ) : (
                  <div className="divide-y max-h-[400px] overflow-y-auto">
                    {entries.map((e) => (
                      <div
                        key={e.path}
                        className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {e.type === "dir" ? (
                            <svg className="w-5 h-5 shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          )}
                          <span className="font-medium truncate">{e.name}</span>
                        </div>
                        {e.type === "dir" && (
                          <button
                            onClick={() => listContents(e.path)}
                            className="px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium"
                          >
                            Open →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Link button */}
              <div className="flex items-center justify-between p-4 bg-linear-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                <div>
                  <p className="font-semibold text-green-900 dark:text-green-100">Ready to link?</p>
                  <p className="text-sm opacity-70">
                    {path 
                      ? `Link the folder: ${path}` 
                      : "Link the repository root folder"
                    }
                  </p>
                </div>
                <button
                  disabled={!canBrowse || submitting}
                  onClick={onSubmit}
                  className="px-6 py-3 bg-linear-to-r from-green-600 to-blue-600 text-white rounded-xl font-semibold hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Linking...
                    </span>
                  ) : (
                    "🔗 Link This Folder"
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
