"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, GitBranch, MessageSquare, Hammer } from "lucide-react";
import { useAuth } from "@/lib/store";
import { notificationApi } from "@/lib/api";
import { useNotifications } from "@/hooks/use-api";
import { formatRelativeTime } from "@/lib/api-utils";
import type { Notification, NotificationType } from "@/types";

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  new_version: GitBranch,
  comment: MessageSquare,
  build_completed: Hammer,
};

export function NotificationBell() {
  const { token } = useAuth();
  const router = useRouter();
  const { data, patch } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Close on outside click / Escape, so the panel behaves like a menu.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!token) return null;

  const markRead = async (n: Notification) => {
    if (n.read) return;
    patch((prev) => ({
      notifications: prev.notifications.map((item) =>
        item.id === n.id ? { ...item, read: true } : item
      ),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    }));
    try {
      await notificationApi.markRead(n.id, token);
    } catch (error) {
      console.error("Failed to mark notification read:", error);
    }
  };

  const handleSelect = async (n: Notification) => {
    await markRead(n);
    // Rows written before componentSlug existed have no link target.
    if (n.componentSlug) {
      setOpen(false);
      router.push(`/components/${n.componentSlug}`);
    }
  };

  const markAllRead = async () => {
    patch((prev) => ({
      notifications: prev.notifications.map((item) => ({ ...item, read: true })),
      unreadCount: 0,
    }));
    try {
      await notificationApi.markAllRead(token);
    } catch (error) {
      console.error("Failed to mark all notifications read:", error);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        className="brutal-scale relative flex items-center border-2 border-black dark:border-white px-2 py-1.5"
      >
        <Bell className="w-3.5 h-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center border-2 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black text-[10px] font-mono font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto border-2 border-black dark:border-white bg-white dark:bg-black shadow-[4px_4px_0px_0px_#1B1712] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black dark:border-white">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-mono underline hover:no-underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs font-mono text-black/60 dark:text-white/60">
              Nothing yet. Follow a component to hear about new versions.
            </p>
          ) : (
            <ul>
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] ?? Bell;
                return (
                  <li key={n.id} className="border-b border-black/20 dark:border-white/20 last:border-b-0">
                    <button
                      onClick={() => handleSelect(n)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                        n.read ? "opacity-60" : ""
                      }`}
                    >
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs font-mono ${n.read ? "" : "font-bold"}`}>
                          {n.message}
                        </span>
                        <span className="block text-[10px] font-mono text-black/50 dark:text-white/50 mt-1">
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
          )}
        </div>
      )}
    </div>
  );
}
