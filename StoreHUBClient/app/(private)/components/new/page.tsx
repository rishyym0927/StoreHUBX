"use client";

import { ProtectedRoute } from "@/components/common/protected-route";
import { useAuth } from "@/lib/store";
import { componentApi, githubApi } from "@/lib/api";
import { useMutation, useGitHubRepos } from "@/hooks/use-api";
import { parseFrameworks, parseTags, isValidComponentName } from "@/lib/api-utils";
import { useToast } from "@/components/common/toast";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, PencilLine, Search, Sparkles } from "lucide-react";
import type { ComponentCreateRequest, GitHubRepo } from "@/types";

function GithubMark({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

type Mode = "manual" | "github";
// "github" fields came straight off the repo (deterministic). "ai" fields
// are a Groq fallback used only when GitHub's own data was missing/sparse —
// Either way the field stays fully editable.
type FieldSource = "manual" | "github" | "ai";

// Shared with onSubmit so blur-time validation and submit-time validation
// can never drift apart.
function getNameError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Name is required";
  if (!isValidComponentName(trimmed)) {
    return "Use only alphanumeric characters, hyphens, and underscores (2-50 chars)";
  }
  return undefined;
}

function getFrameworksError(value: string): string | undefined {
  if (parseFrameworks(value).length === 0) return "At least one framework is required";
  return undefined;
}

const inputClass =
  "w-full border-2 border-black dark:border-white p-3 bg-transparent font-mono text-sm placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none";

function SourceBadge({ source }: { source: FieldSource }) {
  if (source === "manual") return null;
  if (source === "ai") {
    return (
      <span className="inline-flex items-center gap-1 border border-amber-600 dark:border-amber-400 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-amber-700 dark:text-amber-400">
        <Sparkles className="w-2.5 h-2.5" /> AI-suggested, please review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 border border-black/40 dark:border-white/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-black/60 dark:text-white/60">
      <Sparkles className="w-2.5 h-2.5" /> from github
    </span>
  );
}

export default function NewComponent() {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const { showToast } = useToast();
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>("manual");

  // Controlled fields so a GitHub repo pick can prefill them — still fully editable.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frameworks, setFrameworks] = useState("");
  const [tags, setTags] = useState("");
  const [license, setLicense] = useState("");
  // name/frameworks/license only ever come from GitHub or manual entry;
  // description/tags can additionally come from the AI fallback.
  const [repoFieldSource, setRepoFieldSource] = useState<FieldSource>("manual");
  const [descriptionSource, setDescriptionSource] = useState<FieldSource>("manual");
  const [tagsSource, setTagsSource] = useState<FieldSource>("manual");

  const { mutate, loading, error, reset } = useMutation(
    (data: ComponentCreateRequest) => componentApi.create(data, token!)
  );
  const [linking, setLinking] = useState(false);

  // --- GitHub repo picker state ---
  const { data: repos, loading: loadingRepos } = useGitHubRepos();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [autofilling, setAutofilling] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);
  // Bumped on every repo pick so a slow/late-resolving autofill response from
  // a repo the user has since moved away from can't overwrite the form with
  // stale data — only the response matching the current requestId applies.
  const autofillRequestId = useRef(0);

  const filteredRepos = useMemo(() => {
    if (!repos) return [];
    if (!searchTerm) return repos;
    const lower = searchTerm.toLowerCase();
    return repos.filter(
      (r) => r.full_name.toLowerCase().includes(lower) || r.name.toLowerCase().includes(lower)
    );
  }, [repos, searchTerm]);

  async function onSelectRepo(r: GitHubRepo) {
    setSelectedRepo(r);
    setAutofillError(null);
    if (!token) return;

    const requestId = ++autofillRequestId.current;
    setAutofilling(true);
    try {
      const data = await githubApi.getAutofill(
        { owner: r.owner.login, repo: r.name, ref: r.default_branch },
        token
      );
      if (requestId !== autofillRequestId.current) return; // superseded by a later repo pick

      const frameworksList = data.frameworks || [];
      const tagsList = data.tags || [];
      setName(data.name || r.name);
      setDescription(data.description || "");
      setFrameworks(frameworksList.join(", "));
      setTags(tagsList.join(", "));
      setLicense(data.license || "");
      setRepoFieldSource("github");
      setDescriptionSource(data.description ? data.descriptionSource : "manual");
      setTagsSource(tagsList.length > 0 ? data.tagsSource : "manual");
    } catch (e) {
      if (requestId !== autofillRequestId.current) return;
      setAutofillError(e instanceof Error ? e.message : "Failed to autofill from this repo");
      setName(r.name);
      setRepoFieldSource("manual");
      setDescriptionSource("manual");
      setTagsSource("manual");
    } finally {
      if (requestId === autofillRequestId.current) setAutofilling(false);
    }
  }

  // Link the just-created component to the repo the user picked in "From
  // GitHub" mode, so they aren't asked to pick the same repo again on the
  // import page. Best-effort: on any failure we fall back to that page with
  // the repo preselected instead of leaving the component unlinked silently.
  async function autoLinkRepo(slug: string, r: GitHubRepo): Promise<boolean> {
    if (!token) return false;
    try {
      const branch = await githubApi.getBranch(
        { owner: r.owner.login, repo: r.name, branch: r.default_branch || "main" },
        token
      );
      await componentApi.link(
        slug,
        {
          owner: r.owner.login,
          repo: r.name,
          path: "",
          ref: r.default_branch || "main",
          commit: branch.commit.sha,
        },
        token
      );
      showToast("Component created and linked to GitHub — build queued.", "success");
      return true;
    } catch (e) {
      console.error("Auto-link after create failed:", e);
      showToast("Component created, but linking to GitHub failed — finish linking below.", "error");
      return false;
    }
  }

  function changeRepo() {
    setSelectedRepo(null);
    setAutofillError(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFormErrors({});
    reset();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    reset();
    setFormErrors({});

    const trimmedName = name.trim();
    const errors: Record<string, string> = {};

    const nameError = getNameError(name);
    if (nameError) errors.name = nameError;

    const parsedFrameworks = parseFrameworks(frameworks);
    const frameworksError = getFrameworksError(frameworks);
    if (frameworksError) errors.frameworks = frameworksError;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload: ComponentCreateRequest = {
      name: trimmedName,
      description: description.trim(),
      frameworks: parsedFrameworks,
      tags: parseTags(tags),
      license: license.trim() || "MIT",
    };

    const result = await mutate(payload);
    if (!result) return;

    const slug = result.component.slug;

    if (mode === "github" && selectedRepo) {
      setLinking(true);
      const linked = await autoLinkRepo(slug, selectedRepo);
      setLinking(false);
      if (linked) {
        router.push(`/components/${slug}`);
        return;
      }
      // Auto-link failed — send the user to finish linking manually, but
      // with the repo preselected so they don't have to search/pick again.
      const params = new URLSearchParams({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        ref: selectedRepo.default_branch || "main",
      });
      router.push(`/components/${slug}/import?${params.toString()}`);
      return;
    }

    showToast("Component created.", "success");
    router.push(`/components/${slug}`);
  }

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto space-y-8 pb-12">
        <div className="border-2 border-black dark:border-white p-6 md:p-8">
          <div className="inline-block border border-black dark:border-white px-2 py-1 text-xs font-mono mb-4">
            NEW COMPONENT
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Create New Component</h1>
          <p className="text-sm md:text-base font-mono text-black/60 dark:text-white/60 mt-2">
            Publish a new UI component to the registry.
          </p>
        </div>

        {/* Mode switch */}
        <div className="grid grid-cols-2 border-2 border-black dark:border-white">
          <button
            type="button"
            onClick={() => switchMode("manual")}
            className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-mono font-bold uppercase tracking-wide transition-colors ${
              mode === "manual"
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            <PencilLine className="w-4 h-4" /> Manual
          </button>
          <button
            type="button"
            onClick={() => switchMode("github")}
            className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-mono font-bold uppercase tracking-wide border-l-2 border-black dark:border-white transition-colors ${
              mode === "github"
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            <GithubMark className="w-4 h-4" /> From GitHub
          </button>
        </div>

        {/* GitHub repo picker */}
        {mode === "github" && (
          <div className="border-2 border-black dark:border-white p-6 space-y-4">
            {!selectedRepo ? (
              <>
                <div>
                  <h2 className="font-bold text-lg">Choose a repository</h2>
                  <p className="text-sm font-mono text-black/60 dark:text-white/60 mt-1">
                    We&apos;ll prefill description, license, tags and frameworks from it.
                  </p>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input
                    type="text"
                    placeholder="Search your repositories..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`${inputClass} pl-9`}
                  />
                </div>

                {loadingRepos ? (
                  <div className="p-8 border-2 border-dashed border-black/30 dark:border-white/30 text-center">
                    <div className="inline-block w-6 h-6 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-sm font-mono text-black/60 dark:text-white/60">Loading your repositories...</p>
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-black/30 dark:border-white/30 text-center">
                    <p className="text-sm font-mono text-black/60 dark:text-white/60">
                      {searchTerm ? "No repositories match your search." : "No repositories found."}
                    </p>
                  </div>
                ) : (
                  <div className="border-2 border-black dark:border-white divide-y divide-black/20 dark:divide-white/20 max-h-80 overflow-y-auto">
                    {filteredRepos.map((r) => (
                      <button
                        key={r.full_name}
                        type="button"
                        onClick={() => onSelectRepo(r)}
                        className="w-full text-left px-4 py-3 hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-between gap-3"
                      >
                        <span className="font-mono text-sm truncate">{r.full_name}</span>
                        {r.private && (
                          <span className="shrink-0 text-[10px] font-mono uppercase border border-black/40 dark:border-white/40 px-1.5 py-0.5">
                            private
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-mono uppercase text-black/50 dark:text-white/50">Selected repository</p>
                  <p className="font-mono font-bold truncate">{selectedRepo.full_name}</p>
                </div>
                <button
                  type="button"
                  onClick={changeRepo}
                  className="shrink-0 px-3 py-1.5 border-2 border-black dark:border-white text-xs font-mono font-bold uppercase hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  Change
                </button>
              </div>
            )}

            {autofilling && (
              <p className="text-sm font-mono text-black/60 dark:text-white/60 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
                Fetching repo details...
              </p>
            )}

            {autofillError && (
              <p className="text-sm font-mono text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {autofillError} — fields left blank, fill them in manually.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 border-2 border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950">
            <p className="text-sm font-mono text-red-600 dark:text-red-400 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </p>
          </div>
        )}

        <form onSubmit={onSubmit} className="border-2 border-black dark:border-white p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wide">
              Name <SourceBadge source={repoFieldSource} />
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => {
                const nameError = getNameError(e.target.value);
                setFormErrors((prev) => {
                  const next = { ...prev };
                  if (nameError) next.name = nameError;
                  else delete next.name;
                  return next;
                });
              }}
              placeholder="pricing-card"
              className={`${inputClass} ${formErrors.name ? "border-red-600 dark:border-red-400" : ""}`}
              required
            />
            {formErrors.name && (
              <p className="text-xs font-mono text-red-600 dark:text-red-400">{formErrors.name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wide">
              Description <SourceBadge source={descriptionSource} />
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A responsive pricing card with billing toggle"
              rows={3}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wide">
              Frameworks <SourceBadge source={repoFieldSource} />
            </label>
            <input
              value={frameworks}
              onChange={(e) => setFrameworks(e.target.value)}
              onBlur={(e) => {
                const frameworksError = getFrameworksError(e.target.value);
                setFormErrors((prev) => {
                  const next = { ...prev };
                  if (frameworksError) next.frameworks = frameworksError;
                  else delete next.frameworks;
                  return next;
                });
              }}
              placeholder="react, vue, svelte"
              className={`${inputClass} ${formErrors.frameworks ? "border-red-600 dark:border-red-400" : ""}`}
              required
            />
            {formErrors.frameworks && (
              <p className="text-xs font-mono text-red-600 dark:text-red-400">{formErrors.frameworks}</p>
            )}
            <p className="text-xs font-mono text-black/50 dark:text-white/50">Comma-separated.</p>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wide">
              Tags <SourceBadge source={tagsSource} />
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ui, button, form"
              className={inputClass}
            />
            <p className="text-xs font-mono text-black/50 dark:text-white/50">
              Optional — comma-separated, helps others discover your component.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wide">
              License <SourceBadge source={repoFieldSource} />
            </label>
            <input
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="MIT"
              className={inputClass}
            />
          </div>

          <button
            disabled={loading || linking}
            className="brutal-lift w-full md:w-auto px-6 py-3 border-2 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-mono font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
          >
            {loading ? "Creating..." : linking ? "Linking to GitHub..." : "Create Component"}
          </button>
        </form>
      </div>
    </ProtectedRoute>
  );
}
