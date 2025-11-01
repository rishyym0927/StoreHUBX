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

  useEffect(() => {
    async function checkOwnership() {
      if (!user || !token) {
        router.push(`/components/${slug}`);
        return;
      }

      try {
        const comp = await componentApi.get(slug, token);
        
        // Check if user is the owner
        // ownerId in component corresponds to providerId from the user
        if (comp.ownerId !== user.providerId) {
          setError("You don't have permission to modify this component");
          setTimeout(() => {
            router.push(`/components/${slug}`);
          }, 2000);
          return;
        }

        setComponent(comp);
      } catch (err) {
        setError("Failed to verify ownership");
        setTimeout(() => {
          router.push(`/components/${slug}`);
        }, 2000);
      } finally {
        setLoading(false);
      }
    }

    checkOwnership();
  }, [slug, user, token, router]);

  if (loading) {
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
        <div className="max-w-md p-8 border-2 border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950">
          <h2 className="text-xl font-bold mb-2 text-red-900 dark:text-red-100">
            Access Denied
          </h2>
          <p className="text-sm font-mono text-red-800 dark:text-red-200 mb-4">
            {error}
          </p>
          <p className="text-xs font-mono text-red-700 dark:text-red-300">
            Redirecting you back...
          </p>
        </div>
      </div>
    );
  }

  if (!component) {
    return null;
  }

  return <>{children}</>;
}
