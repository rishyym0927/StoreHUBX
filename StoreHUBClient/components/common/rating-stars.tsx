"use client";

import { useState } from "react";

interface RatingStarsProps {
  rating: number;
  count?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRate?: (score: number) => void;
}

const SIZE_CLASSES: Record<NonNullable<RatingStarsProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

export function RatingStars({
  rating,
  count,
  size = "sm",
  interactive = false,
  onRate,
}: RatingStarsProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const displayValue = hovered ?? rating;

  return (
    <div className="flex items-center gap-1.5 font-mono">
      <div
        className={`flex ${SIZE_CLASSES[size]} ${interactive ? "cursor-pointer" : ""}`}
        onMouseLeave={() => interactive && setHovered(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            onMouseEnter={() => interactive && setHovered(star)}
            onClick={() => interactive && onRate?.(star)}
            className={
              star <= Math.round(displayValue)
                ? "text-black dark:text-white"
                : "text-black/20 dark:text-white/20"
            }
          >
            ★
          </span>
        ))}
      </div>
      {typeof count === "number" && (
        <span className="text-xs text-black/60 dark:text-white/60">
          {rating.toFixed(1)} ({count})
        </span>
      )}
    </div>
  );
}
