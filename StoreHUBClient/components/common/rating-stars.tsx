"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface RatingStarsProps {
  rating: number;
  count?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRate?: (score: number) => void;
}

const SIZE_CLASSES: Record<NonNullable<RatingStarsProps["size"]>, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-5 h-5",
  lg: "w-7 h-7",
};

export function RatingStars({
  rating,
  count,
  size = "sm",
  interactive = false,
  onRate,
}: RatingStarsProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [punched, setPunched] = useState<number | null>(null);
  const displayValue = hovered ?? rating;

  const handleRate = (star: number) => {
    if (!interactive) return;
    onRate?.(star);
    setPunched(star);
    setTimeout(() => setPunched(null), 320);
  };

  return (
    <div className="flex items-center gap-1.5 font-mono">
      <div
        className={`flex gap-0.5 ${interactive ? "cursor-pointer" : ""}`}
        onMouseLeave={() => interactive && setHovered(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            onMouseEnter={() => interactive && setHovered(star)}
            onClick={() => handleRate(star)}
            className={`${SIZE_CLASSES[size]} ${
              interactive && punched !== null && star <= punched ? "animate-punch" : ""
            } ${
              star <= Math.round(displayValue)
                ? "fill-black text-black dark:fill-white dark:text-white"
                : "fill-black/20 text-black/20 dark:fill-white/20 dark:text-white/20"
            }`}
          />
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
