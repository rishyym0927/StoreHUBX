"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/store";
import { ratingApi } from "@/lib/api";
import { RatingStars } from "@/components/common/rating-stars";
import { EmptyState } from "@/components/common/empty-state";
import { useToast } from "@/components/common/toast";
import type { Rating } from "@/types";
import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";

interface RatingsProps {
  slug: string;
}

export function ComponentRatings({ slug }: RatingsProps) {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [ratings, setRatings] = useState<Rating[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [score, setScore] = useState(0);
  const [review, setReview] = useState("");

  const fetchRatings = useCallback(async () => {
    try {
      const data = await ratingApi.list(slug);
      setRatings(data.ratings || []);
      setAverageRating(data.averageRating || 0);
      setRatingCount(data.ratingCount || 0);
      const mine = data.ratings?.find((r) => r.userId === user?.providerId);
      if (mine) {
        setScore(mine.score);
        setReview(mine.review ?? "");
      }
    } catch (error) {
      console.error("Failed to load ratings:", error);
      showToast("Failed to load reviews.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [slug, user?.providerId, showToast]);

  useEffect(() => {
    fetchRatings();
  }, [fetchRatings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user || score < 1) return;

    // Optimistic update: show the review immediately, roll back on failure.
    const previousRatings = ratings;
    const previousAverage = averageRating;
    const previousCount = ratingCount;
    const hadOwnRating = ratings.some((r) => r.userId === user.providerId);

    const optimisticRating: Rating = {
      id: `optimistic-${user.providerId}`,
      componentId: "",
      userId: user.providerId,
      authorUsername: user.username,
      authorName: user.name,
      authorAvatar: user.avatarUrl,
      score,
      review,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    const nextRatings = [optimisticRating, ...ratings.filter((r) => r.userId !== user.providerId)];
    const nextCount = hadOwnRating ? ratingCount : ratingCount + 1;
    const nextAverage = nextRatings.reduce((sum, r) => sum + r.score, 0) / nextRatings.length;

    setRatings(nextRatings);
    setRatingCount(nextCount);
    setAverageRating(nextAverage);
    setIsSubmitting(true);

    try {
      const saved = await ratingApi.upsert(slug, { score, review }, token);
      // Merge the saved rating locally instead of refetching — a refetch
      // would re-derive `score`/`review` from the server list and could
      // clobber an edit the user started while this request was in flight.
      setRatings((prev) => {
        const merged = [saved, ...prev.filter((r) => r.userId !== saved.userId)];
        setRatingCount(merged.length);
        setAverageRating(
          merged.reduce((sum, r) => sum + r.score, 0) / merged.length
        );
        return merged;
      });
    } catch (error) {
      console.error("Failed to submit rating:", error);
      setRatings(previousRatings);
      setAverageRating(previousAverage);
      setRatingCount(previousCount);
      showToast("Failed to submit rating. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !user) return;

    // Same optimistic-with-rollback shape as handleSubmit — recompute the
    // aggregates locally rather than refetching, for the reason above.
    const previousRatings = ratings;
    const previousAverage = averageRating;
    const previousCount = ratingCount;

    const remaining = ratings.filter((r) => r.userId !== user.providerId);
    setRatings(remaining);
    setRatingCount(remaining.length);
    setAverageRating(
      remaining.length ? remaining.reduce((sum, r) => sum + r.score, 0) / remaining.length : 0
    );
    setScore(0);
    setReview("");
    setIsSubmitting(true);

    try {
      await ratingApi.delete(slug, token);
      showToast("Your rating was removed.", "success");
    } catch (error) {
      console.error("Failed to delete rating:", error);
      setRatings(previousRatings);
      setAverageRating(previousAverage);
      setRatingCount(previousCount);
      showToast("Failed to remove rating. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasOwnRating = !!user && ratings.some((r) => r.userId === user.providerId);

  return (
    <div className="mt-12 border-t-4 border-black dark:border-white pt-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <h2 className="text-2xl font-black uppercase tracking-tight">
          Reviews ({ratingCount})
        </h2>
        {ratingCount > 0 && <RatingStars rating={averageRating} count={ratingCount} size="md" />}
      </div>

      {/* Rate box */}
      {user ? (
        <form onSubmit={handleSubmit} className="mb-10 space-y-3">
          <RatingStars rating={score} size="lg" interactive onRate={setScore} />
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Share your thoughts (optional)"
            className="w-full min-h-[80px] p-4 font-mono text-sm border-2 border-black dark:border-white bg-transparent focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-y"
            disabled={isSubmitting}
          />
          <div className="flex justify-end items-center gap-3">
            {hasOwnRating && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="px-4 py-2 font-mono text-sm border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors disabled:opacity-50"
              >
                Remove Rating
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting || score < 1}
              className="px-6 py-2 bg-black text-white dark:bg-white dark:text-black font-mono font-bold uppercase text-sm border-2 border-black dark:border-white hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#1B1712] dark:hover:shadow-[4px_4px_0px_0px_#EFE8D9] transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isSubmitting ? "Saving..." : "Submit Rating"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-10 p-6 border-2 border-black dark:border-white bg-black/5 dark:bg-white/5 text-center font-mono text-sm">
          You must be logged in to leave a rating.
        </div>
      )}

      {/* Ratings List */}
      {isLoading ? (
        <div className="font-mono text-sm animate-pulse">Loading reviews...</div>
      ) : ratings.length === 0 ? (
        <EmptyState icon={Star} title="No Reviews Yet" description="Be the first to rate this component." />
      ) : (
        <div className="space-y-4">
          {ratings.map((rating) => (
            <div key={rating.id} className="p-4 border-2 border-black dark:border-white bg-white dark:bg-black">
              <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
                <Link
                  href={`/users/${rating.userId}`}
                  className="flex items-center gap-2 hover:underline group"
                >
                  {rating.authorAvatar ? (
                    <Image
                      src={rating.authorAvatar}
                      alt={rating.authorUsername || "User"}
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded-full border border-black dark:border-white group-hover:scale-110 transition-transform"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs uppercase">
                      {(rating.authorUsername || rating.authorName || rating.userId).charAt(0)}
                    </div>
                  )}
                  <span className="font-bold font-mono text-sm">
                    {rating.authorName || rating.authorUsername || rating.userId}
                  </span>
                </Link>
                <RatingStars rating={rating.score} />
              </div>
              {rating.review && (
                <p className="font-mono text-sm whitespace-pre-wrap">{rating.review}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
