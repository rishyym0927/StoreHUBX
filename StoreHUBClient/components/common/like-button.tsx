"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/store";
import { componentApi } from "@/lib/api";
import { useRouter } from "next/navigation";

interface LikeButtonProps {
  slug: string;
  initialLikeCount: number;
  initialLikedBy: string[];
}

export function LikeButton({ slug, initialLikeCount, initialLikedBy }: LikeButtonProps) {
  const { token, user } = useAuth();
  const router = useRouter();

  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLoading, setIsLoading] = useState(false);

  // Sync state once user auth hydrates from local storage
  useEffect(() => {
    if (user && initialLikedBy) {
      setIsLiked(initialLikedBy.includes(user.providerId));
    }
  }, [user, initialLikedBy]);

  const handleLike = async () => {
    if (!token || !user) {
      alert("Please login to like this component");
      return;
    }

    // Optimistic UI update
    const previousIsLiked = isLiked;
    const previousLikeCount = likeCount;

    setIsLiked(!isLiked);
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1);
    setIsLoading(true);

    try {
      await componentApi.toggleLike(slug, token);
      router.refresh(); // Refresh page data softly
    } catch (error) {
      // Revert on error
      console.error("Failed to toggle like:", error);
      setIsLiked(previousIsLiked);
      setLikeCount(previousLikeCount);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleLike}
      disabled={isLoading}
      className={`
        flex items-center gap-2 px-4 py-2 border-2 border-black dark:border-white font-mono font-bold uppercase tracking-wider text-sm transition-all
        ${
          isLiked
            ? "bg-black text-white dark:bg-white dark:text-black shadow-none translate-y-1"
            : "bg-white text-black dark:bg-black dark:text-white hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
        }
      `}
    >
      <svg
        className={`w-5 h-5 transition-transform ${isLiked ? "scale-110" : ""}`}
        fill={isLiked ? "currentColor" : "none"}
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={isLiked ? 0 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
      {likeCount} {likeCount === 1 ? "Like" : "Likes"}
    </button>
  );
}
