"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/common/protected-route";
import { useAuth } from "@/lib/store";
import { userApi, ApiError } from "@/lib/api";
import type { OwnerAnalyticsResponse } from "@/types";
import { RatingStars } from "@/components/common/rating-stars";

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-2 border-black dark:border-white p-6 text-center">
      <div className="text-3xl sm:text-4xl font-black tracking-tight">{value}</div>
      <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<OwnerAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    userApi
      .getAnalytics(token)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-10">
          <div className="flex items-center justify-between gap-4 flex-wrap border-b-2 border-black dark:border-white pb-6">
            <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter">
              Analytics
            </h1>
            <Link
              href="/me"
              className="text-sm font-mono font-bold border-2 border-black dark:border-white px-4 py-2 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
            >
              Back to Profile
            </Link>
          </div>

          {loading && (
            <div className="text-center py-20 font-mono text-sm animate-pulse">
              Loading analytics...
            </div>
          )}

          {error && (
            <div className="p-4 border-2 border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950 font-mono text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatTile label="Components" value={data.totals.componentCount} />
                <StatTile label="Total Views" value={data.totals.viewCount} />
                <StatTile label="Total Likes" value={data.totals.likeCount} />
                <StatTile label="Total Comments" value={data.totals.commentCount} />
              </div>

              {data.components.length === 0 ? (
                <div className="text-center py-16 font-mono text-sm text-black/60 dark:text-white/60">
                  You don&apos;t own any components yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {data.components.map((comp) => (
                    <div
                      key={comp.id}
                      className="border-2 border-black dark:border-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/components/${comp.slug}`}
                          className="font-bold text-lg hover:underline"
                        >
                          {comp.name}
                        </Link>
                        {comp.ratingCount > 0 && (
                          <div className="mt-1">
                            <RatingStars rating={comp.averageRating} count={comp.ratingCount} />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-6 text-xs font-mono shrink-0">
                        <div>
                          <div className="font-bold text-lg">{comp.viewCount}</div>
                          <div className="text-black/60 dark:text-white/60 uppercase">Views</div>
                        </div>
                        <div>
                          <div className="font-bold text-lg">{comp.likeCount}</div>
                          <div className="text-black/60 dark:text-white/60 uppercase">Likes</div>
                        </div>
                        <div>
                          <div className="font-bold text-lg">{comp.commentCount}</div>
                          <div className="text-black/60 dark:text-white/60 uppercase">Comments</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
