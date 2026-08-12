"use client";
import React, { useState, useEffect } from "react";

import { ProtectedRoute } from "@/components/common/protected-route";
import { OwnershipGuard } from "@/components/common/ownership-guard";
import { useAuth } from "@/lib/store";
import { versionApi } from "@/lib/api";
import { useMutation, useComponent } from "@/hooks/use-api";
import { isValidVersion, isValidUrl } from "@/lib/api-utils";
import { useRouter } from "next/navigation";
import type { VersionCreateRequest } from "@/types";
import { CheckCircle2, AlertTriangle, PartyPopper } from "lucide-react";

const inputClass =
  "w-full border-2 border-black dark:border-white p-3 bg-transparent font-mono text-sm placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none";

export default function NewVersion({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState<string>("");
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showBuildStatus, setShowBuildStatus] = useState(false);

  const { mutate, loading, error, reset } = useMutation(
    (data: VersionCreateRequest) => versionApi.create(slug, data, token!)
  );
  
  // Unwrap the params Promise to get the slug
  useEffect(() => {
    const unwrapParams = async () => {
      try {
        const unwrappedParams = await params;
        setSlug(unwrappedParams.slug);
      } catch (error) {
        console.error("Error unwrapping params:", error);
      }
    };
    
    unwrapParams();
  }, [params]);

  // Fetch component to check if it has a repo linked
  const { data: component } = useComponent(slug);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    reset();
    setFormErrors({});
    
    const form = new FormData(e.currentTarget);
    const version = String(form.get("version") || "").trim();
    const changelog = String(form.get("changelog") || "").trim();
    const codeUrl = String(form.get("codeUrl") || "").trim();
    const readme = String(form.get("readme") || "").trim();

    // Client-side validation
    const errors: Record<string, string> = {};

    if (!version) {
      errors.version = "Version is required";
    } else if (!isValidVersion(version)) {
      errors.version = "Version should follow semantic versioning (e.g., 1.0.0)";
    }

    // Validate URLs if provided
    if (codeUrl && !isValidUrl(codeUrl)) {
      errors.codeUrl = "Please enter a valid URL";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload: VersionCreateRequest = {
      version,
      changelog: changelog || undefined,
      codeUrl: codeUrl || undefined,
      readme: readme || undefined,
      // Include commit SHA from component's repoLink if available
      commitSha: component?.repoLink?.commit || undefined,
    };

    const result = await mutate(payload);
    
    if (result && token) {
      // Version is created, build is automatically triggered by backend
      setShowBuildStatus(true);
      
      // Redirect after a short delay
      setTimeout(() => {
        router.push(`/components/${slug}`);
      }, 2000);
    }
  }

  return (
    <ProtectedRoute>
      <OwnershipGuard slug={slug}>
        <div className="max-w-xl mx-auto space-y-6 pb-12">
        {!showBuildStatus ? (
          <>
            <div className="border-2 border-black dark:border-white p-6 md:p-8">
              <div className="inline-block border border-black dark:border-white px-2 py-1 text-xs font-mono mb-4">
                NEW VERSION
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Add New Version</h1>
              <p className="text-sm font-mono text-black/60 dark:text-white/60 mt-2">
                Component: <span className="font-bold">{slug}</span>
              </p>
              {component?.repoLink && (
                <p className="text-xs font-mono text-green-600 dark:text-green-400 mt-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Linked to {component.repoLink.owner}/{component.repoLink.repo} — build will be triggered automatically
                </p>
              )}
              {!component?.repoLink && (
                <p className="text-xs font-mono text-yellow-600 dark:text-yellow-400 mt-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> No repository linked. Consider linking a GitHub repo for automated builds.
                </p>
              )}
            </div>

            {error && (
              <div className="p-4 border-2 border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950">
                <p className="text-sm font-mono text-red-600 dark:text-red-400 font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </p>
              </div>
            )}

            <form onSubmit={onSubmit} className="border-2 border-black dark:border-white p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold uppercase tracking-wide">Version</label>
                <input
                  name="version"
                  placeholder="1.0.0"
                  required
                  className={`${inputClass} ${formErrors.version ? "border-red-600 dark:border-red-400" : ""}`}
                />
                {formErrors.version && (
                  <p className="text-xs font-mono text-red-600 dark:text-red-400">{formErrors.version}</p>
                )}
                <p className="text-xs font-mono text-black/50 dark:text-white/50">Use semantic versioning: major.minor.patch</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold uppercase tracking-wide">Changelog</label>
                <textarea
                  name="changelog"
                  placeholder="What changed in this release?"
                  rows={3}
                  className={inputClass}
                />
                <p className="text-xs font-mono text-black/50 dark:text-white/50">Optional — describe what&apos;s new or changed.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold uppercase tracking-wide">Code URL</label>
                <input
                  name="codeUrl"
                  placeholder="GitHub Gist or repository URL"
                  className={`${inputClass} ${formErrors.codeUrl ? "border-red-600 dark:border-red-400" : ""}`}
                />
                {formErrors.codeUrl && (
                  <p className="text-xs font-mono text-red-600 dark:text-red-400">{formErrors.codeUrl}</p>
                )}
                <p className="text-xs font-mono text-black/50 dark:text-white/50">Optional — link to source code.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold uppercase tracking-wide">README / Usage</label>
                <textarea
                  name="readme"
                  placeholder="Usage instructions or documentation (Markdown supported)"
                  rows={6}
                  className={inputClass}
                />
                <p className="text-xs font-mono text-black/50 dark:text-white/50">Optional — Markdown supported.</p>
              </div>

              <button
                disabled={loading}
                className="brutal-lift w-full md:w-auto px-6 py-3 border-2 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black font-mono font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
              >
                {loading ? "Publishing..." : "Publish Version"}
              </button>
            </form>
          </>
        ) : (
          <div className="space-y-6">
            <div className="border-2 border-black dark:border-white p-6 md:p-8">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-2">
                Version Published! <PartyPopper className="w-6 h-6" />
              </h1>
              <p className="text-sm font-mono text-black/60 dark:text-white/60 mt-2">
                {component?.repoLink
                  ? "Build has been automatically queued for your component."
                  : "Version created successfully."}
              </p>
            </div>

            <div className="border-2 border-green-600 dark:border-green-400 bg-green-50 dark:bg-green-950 p-6">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-700 dark:text-green-400 shrink-0" />
                <span className="font-mono font-bold text-green-900 dark:text-green-100">Version created successfully</span>
              </div>
              <p className="text-sm font-mono text-green-800 dark:text-green-200 opacity-80">
                Your component version has been published and the build job is in queue.
              </p>
            </div>

            <div className="text-center pt-2">
              <p className="text-xs font-mono text-black/60 dark:text-white/60 mb-3">Redirecting to component page...</p>
              <button
                onClick={() => router.push(`/components/${slug}`)}
                className="px-6 py-3 border-2 border-black dark:border-white font-mono font-bold uppercase tracking-wide hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                Go to Component
              </button>
            </div>
          </div>
        )}
      </div>
      </OwnershipGuard>
    </ProtectedRoute>
  );
}
