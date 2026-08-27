"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Bell, GitBranch, MessageSquare, Hammer, AlertTriangle } from "lucide-react";
import { ProtectedRoute } from "@/components/common/protected-route";
import { Pagination } from "@/components/common/pagination";
import { EmptyState } from "@/components/common/empty-state";
import { useAuth } from "@/lib/store";
import { notificationApi, ApiError } from "@/lib/api";
import { formatRelativeTime } from "@/lib/api-utils";
import type { Notification, NotificationType, NotificationsListResponse } from "@/types";

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  new_version: GitBranch,
  comment: MessageSquare,
  build_completed: Hammer,
};

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <NotificationsPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function NotificationsPageContent() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const itemsPerPage = parseInt(searchParams.get("limit") || "20", 10);

  const [result, setResult] = useState<NotificationsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({ page: currentPage, limit: itemsPerPage }),
    [currentPage, itemsPerPage]
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await notificationApi.list(token, queryParams);
      setResult(response);
    } catch (err) {
      console.error("Notifications fetch error:", err);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to fetch notifications"
      );
    } finally {
      setLoading(false);
    }
  }, [token, queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  const notifications = result?.notifications ?? [];
  const total = result?.total ?? 0;
  const unreadCount = result?.unreadCount ?? 0;
  // Derive from the server-echoed limit, not the raw URL param — the
  // backend clamps out-of-range values (see notification_handler.go), so
  // the URL's limit can disagree with what was actually applied.
  const totalPages = Math.ceil(total / (result?.limit || itemsPerPage));

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    params.set("limit", String(itemsPerPage));
    router.push(`/notifications?${params.toString()}`);
  };

  const markRead = async (n: Notification) => {
    if (!token || n.read) return;
    setResult((prev) =>
      prev
        ? {
            ...prev,
            notifications: prev.notifications.map((item) =>
              item.id === n.id ? { ...item, read: true } : item
            ),
            unreadCount: Math.max(0, prev.unreadCount - 1),
          }
        : prev
    );
    try {
      await notificationApi.markRead(n.id, token);
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }
  };

  const markAllRead = async () => {
    if (!token) return;
    setResult((prev) =>
      prev
        ? {
            ...prev,
            notifications: prev.notifications.map((item) => ({ ...item, read: true })),
            unreadCount: 0,
          }
        : prev
    );
    try {
      await notificationApi.markAllRead(token);
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
    }
  };

  const handleSelect = async (n: Notification) => {
    await markRead(n);
    if (n.componentSlug) {
      router.push(`/components/${n.componentSlug}`);
    }
  };

  return (
    <div className="space-y-8 sm:space-y-12 pb-12">
      <section className="border-b-2 border-black dark:border-white pb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            Notifications
          </h1>
          <p className="text-sm font-mono text-black/60 dark:text-white/60">
            New versions, comments, and build results on components you follow
          </p>
        </div>
        {!loading && unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="brutal-lift border-2 border-black dark:border-white px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider"
          >
            Mark all read
          </button>
        )}
      </section>

      {error && (
        <EmptyState
          icon={AlertTriangle}
          title="Something Went Wrong"
          description={error}
          variant="error"
          action={
            <button
              onClick={load}
              className="border-2 border-red-600 dark:border-red-400 px-4 py-2 text-xs font-mono font-bold transition-colors hover:bg-red-600 hover:text-white dark:hover:bg-red-400 dark:hover:text-black"
            >
              Try Again
            </button>
          }
        />
      )}

      <section className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-black dark:border-white pb-4">
          <h2 className="text-2xl font-bold tracking-tight">
            {loading ? "Loading..." : `${total} notification${total !== 1 ? "s" : ""}`}
          </h2>
          {!loading && totalPages > 1 && (
            <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase font-bold">
              Page {currentPage} of {totalPages}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-0 border-2 border-black dark:border-white divide-y-2 divide-black/20 dark:divide-white/20">
            {Array.from({ length: Math.min(itemsPerPage, 8) }, (_, i) => (
              <div key={i} className="h-16 animate-pulse bg-black/5 dark:bg-white/5" />
            ))}
          </div>
        ) : notifications.length === 0 && !error ? (
          <EmptyState
            icon={Bell}
            title="Nothing Yet"
            description="Follow a component to hear about new versions, comments, and build results."
          />
        ) : (
          !error && (
            <>
              <ul className="border-2 border-black dark:border-white divide-y-2 divide-black/20 dark:divide-white/20">
                {notifications.map((n) => {
                  const Icon = TYPE_ICONS[n.type] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => handleSelect(n)}
                        className={`w-full text-left px-4 sm:px-6 py-4 flex items-start gap-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                          n.read ? "opacity-60" : ""
                        }`}
                      >
                        <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-mono ${n.read ? "" : "font-bold"}`}>
                            {n.message}
                          </span>
                          <span className="block text-xs font-mono text-black/50 dark:text-white/50 mt-1">
                            {formatRelativeTime(n.createdAt)}
                          </span>
                        </span>
                        {!n.read && (
                          <span className="w-2 h-2 mt-1.5 shrink-0 bg-black dark:bg-white" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
            </>
          )
        )}
      </section>
    </div>
  );
}
