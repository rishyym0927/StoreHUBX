"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { useAuth } from "@/lib/store";
import { followApi, ApiError } from "@/lib/api";
import { useToast } from "@/components/common/toast";

interface FollowButtonProps {
  /**
   * The component's **id**, not its slug — follows are stored against the
   * component's ObjectID hex, which is what the notification fan-out queries.
   */
  componentId: string;
  ownerId: string;
  initialFollowedByMe: boolean;
}

export function FollowButton({ componentId, ownerId, initialFollowedByMe }: FollowButtonProps) {
  const { token, user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [isFollowing, setIsFollowing] = useState(initialFollowedByMe);
  const [isLoading, setIsLoading] = useState(false);

  // Re-sync if auth hydrates after first paint (the persisted store can
  // resolve late), matching LikeButton.
  useEffect(() => {
    if (user && !isLoading) {
      setIsFollowing(initialFollowedByMe);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, initialFollowedByMe]);

  // Following your own component would only notify you about your own
  // publishes, so the control simply doesn't exist for the owner.
  if (user && (user.providerId === ownerId || user.id === ownerId)) {
    return null;
  }

  const handleToggle = async () => {
    if (!token || !user) {
      showToast("Please login to follow this component", "info");
      return;
    }

    const previous = isFollowing;
    setIsFollowing(!isFollowing);
    setIsLoading(true);

    try {
      const target = { targetType: "component" as const, targetId: componentId };
      if (previous) {
        await followApi.unfollow(target, token);
      } else {
        await followApi.follow(target, token);
      }
      router.refresh();
    } catch (error) {
      console.error("Failed to toggle follow:", error);
      setIsFollowing(previous);
      showToast(
        error instanceof ApiError ? error.message : "Failed to update follow. Please try again.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      title={
        isFollowing
          ? "Stop getting notified about new versions"
          : "Get notified when a new version is published"
      }
      className={`
        brutal-lift flex items-center gap-2 px-4 py-2 border-2 border-black dark:border-white font-mono font-bold uppercase tracking-wider text-sm
        ${
          isFollowing
            ? "bg-black text-white dark:bg-white dark:text-black"
            : "bg-white text-black dark:bg-black dark:text-white"
        }
      `}
    >
      {isFollowing ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
