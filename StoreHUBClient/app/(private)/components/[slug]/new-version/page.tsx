"use client";
import React, { useState, useEffect } from "react";

import { ProtectedRoute } from "@/components/common/protected-route";
import { useAuth } from "@/lib/store";
import { versionApi, buildApi, componentApi } from "@/lib/api";
import { useMutation, useComponent } from "@/hooks/use-api";
import { isValidVersion, isValidUrl } from "@/lib/api-utils";
import { useRouter } from "next/navigation";
import type { VersionCreateRequest } from "@/types";
import { BuildStatus } from "@/components/common/build-status";

export default function NewVersion({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState<string>("");
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [buildId, setBuildId] = useState<string | null>(null);
  const [showBuildStatus, setShowBuildStatus] = useState(false);
  const [triggeringBuild, setTriggeringBuild] = useState(false);

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
    const previewUrl = String(form.get("previewUrl") || "").trim();
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
    
    if (previewUrl && !isValidUrl(previewUrl)) {
      errors.previewUrl = "Please enter a valid URL";
    }
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload: VersionCreateRequest = {
      version,
      changelog: changelog || undefined,
      codeUrl: codeUrl || undefined,
      previewUrl: previewUrl || undefined,
      readme: readme || undefined,
    };

    const result = await mutate(payload);
    
    if (result && token) {
      // If component has a repo linked, automatically trigger a build
      if (component?.repoLink) {
        setShowBuildStatus(true);
        setTriggeringBuild(true);
        
        try {
          const buildResult = await buildApi.enqueue(slug, version, token);
          setBuildId(buildResult.jobId);
          setTriggeringBuild(false);
        } catch (err) {
          console.error("Failed to trigger build:", err);
          setTriggeringBuild(false);
          // Still show success message even if build fails
          setTimeout(() => {
            router.push(`/components/${slug}`);
          }, 2000);
        }
      } else {
        // No repo linked, redirect immediately
        router.push(`/components/${slug}`);
      }
    }
  }

  return (
    <ProtectedRoute>
      <div className="max-w-xl space-y-6">
        {!showBuildStatus ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold">Add New Version</h1>
              <p className="text-sm opacity-70 mt-1">Component: <span className="font-mono font-medium">{slug}</span></p>
              {component?.repoLink && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  ✓ Linked to {component.repoLink.owner}/{component.repoLink.repo} - Build will be triggered automatically
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 border-2 border-red-500/50 bg-red-500/10 rounded-xl text-sm">
                <p className="text-red-600 dark:text-red-400 font-medium">⚠️ {error}</p>
              </div>
            )}

            <div>
              <input
                name="version"
                placeholder="Version (e.g., 1.0.0)"
                required
                className={`w-full border rounded-xl p-3 bg-transparent ${formErrors.version ? 'border-red-500' : ''}`}
              />
              {formErrors.version && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.version}</p>
              )}
              <p className="text-xs opacity-60 mt-1">Use semantic versioning: major.minor.patch</p>
            </div>

            <div>
              <textarea
                name="changelog"
                placeholder="Changelog (what changed in this release?)"
                className="w-full border rounded-xl p-3 bg-transparent"
              />
              <p className="text-xs opacity-60 mt-1">Optional: Describe what's new or changed</p>
            </div>

            <div>
              <input
                name="codeUrl"
                placeholder="GitHub Gist or Repository URL"
                className={`w-full border rounded-xl p-3 bg-transparent ${formErrors.codeUrl ? 'border-red-500' : ''}`}
              />
              {formErrors.codeUrl && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.codeUrl}</p>
              )}
              <p className="text-xs opacity-60 mt-1">Optional: Link to source code</p>
            </div>

            <div>
              <input
                name="previewUrl"
                placeholder="CodeSandbox / StackBlitz Embed URL"
                className={`w-full border rounded-xl p-3 bg-transparent ${formErrors.previewUrl ? 'border-red-500' : ''}`}
              />
              {formErrors.previewUrl && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.previewUrl}</p>
              )}
              <p className="text-xs opacity-60 mt-1">Optional: Live preview URL (CodeSandbox, StackBlitz, etc.)</p>
            </div>

            <div>
              <textarea
                name="readme"
                placeholder="README / Usage (Markdown supported)"
                className="w-full border rounded-xl p-3 bg-transparent min-h-[150px]"
              />
              <p className="text-xs opacity-60 mt-1">Optional: Usage instructions or documentation (Markdown supported)</p>
            </div>

            <button 
              disabled={loading} 
              className="px-4 py-2 rounded-xl border disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Publishing..." : "Publish Version"}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold">Version Published! 🎉</h1>
              <p className="text-sm opacity-70 mt-1">
                {component?.repoLink 
                  ? "Building your component from the linked repository..."
                  : "Version created successfully"
                }
              </p>
            </div>

            {triggeringBuild && (
              <div className="border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm opacity-70">Triggering build...</span>
                </div>
              </div>
            )}

            {buildId && !triggeringBuild && (
              <>
                <BuildStatus 
                  buildId={buildId} 
                  autoRefresh={true}
                  onComplete={() => {
                    setTimeout(() => {
                      router.push(`/components/${slug}`);
                    }, 3000);
                  }}
                />
                <div className="text-center">
                  <button
                    onClick={() => router.push(`/components/${slug}`)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View Component Page →
                  </button>
                </div>
              </>
            )}

            {!component?.repoLink && !triggeringBuild && (
              <div className="text-center pt-4">
                <p className="text-sm opacity-70 mb-3">Redirecting to component page...</p>
                <button
                  onClick={() => router.push(`/components/${slug}`)}
                  className="px-4 py-2 rounded-xl border hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Go to Component
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
