"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/store";
import { componentApi } from "@/lib/api";
import type { Component } from "@/types";

interface OwnershipGuardProps {
  slug: string;
  children: React.ReactNode;
}

export function OwnershipGuard({ slug, children }: OwnershipGuardProps) {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const [component, setComponent] = useState<Component | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Don't check ownership until hydrated and the slug (unwrapped from the
    // App Router params Promise by the caller) has actually resolved —
    // checking against an empty slug spuriously 404s.
    if (!hydrated || !slug) return;

    let redirectTimeoutId: ReturnType<typeof setTimeout> | undefined;
    // Guards against a stale in-flight check: if deps change again while
    // componentApi.get() is still pending, cleanup below runs before this
    // run has scheduled a timeout (redirectTimeoutId is still undefined), so
    // there'd be nothing to clearTimeout. Without this flag, that stale
    // check would still call setError/setTimeout after the fact and could
    // redirect even though a later, correct check already granted access.
    let cancelled = false;

    async function checkOwnership() {
      if (!user || !token) {
        router.push(`/components/${slug}`);
        return;
      }

      try {
        const comp = await componentApi.get(slug, token);
        if (cancelled) return;

        // Check if user is the owner
        // ownerId in component corresponds to providerId from the user
        if (comp.ownerId !== user.providerId) {
          setError("You don't have permission to modify this component");
          redirectTimeoutId = setTimeout(() => {
            router.push(`/components/${slug}`);
          }, 2000);
          return;
        }

        setComponent(comp);
      } catch {
        if (cancelled) return;
        setError("Failed to verify ownership");
        redirectTimeoutId = setTimeout(() => {
          router.push(`/components/${slug}`);
        }, 2000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkOwnership();

    // Clear any pending redirect if slug/user/token change (or we unmount)
    // before it fires — otherwise a stale check's redirect can fire after a
    // later, correct check has already granted access.
    return () => {
      cancelled = true;
      if (redirectTimeoutId) clearTimeout(redirectTimeoutId);
    };
  }, [hydrated, slug, user, token, router]);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-black dark:border-white border-t-transparent dark:border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-mono text-black/60 dark:text-white/60">
            Verifying ownership...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          role="alert"
          className="max-w-md p-8 border-2 border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950"
        >
          <h2 className="text-xl font-bold mb-2 text-red-900 dark:text-red-100">
            Access Denied
          </h2>
          <p className="text-sm font-mono text-red-800 dark:text-red-200 mb-4">
            {error}
          </p>
          <p className="text-xs font-mono text-red-700 dark:text-red-300 mb-4">
            Redirecting you back...
          </p>
          <button
            type="button"
            onClick={() => router.push(`/components/${slug}`)}
            className="text-sm font-mono font-bold underline text-red-900 dark:text-red-100 hover:no-underline"
          >
            Go back now
          </button>
        </div>
      </div>
    );
  }

  if (!component) {
    return null;
  }

  return <>{children}</>;
}
