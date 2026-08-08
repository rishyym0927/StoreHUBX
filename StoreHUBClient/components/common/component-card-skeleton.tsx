export function ComponentCardSkeleton() {
  return (
    <div className="border-2 border-black dark:border-white">
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-6 sm:h-7 skeleton-shimmer w-2/3" />
            <div className="h-4 skeleton-shimmer w-full" />
          </div>
          <div className="h-7 w-20 skeleton-shimmer shrink-0" />
        </div>

        {/* Frameworks */}
        <div className="flex gap-2 pt-2 border-t border-black/20 dark:border-white/20">
          <div className="h-6 w-16 skeleton-shimmer" />
          <div className="h-6 w-20 skeleton-shimmer" />
        </div>

        {/* Tags */}
        <div className="flex gap-2">
          <div className="h-4 w-12 skeleton-shimmer" />
          <div className="h-4 w-16 skeleton-shimmer" />
          <div className="h-4 w-10 skeleton-shimmer" />
        </div>

        {/* Footer */}
        <div className="flex gap-4 pt-4 border-t border-black/20 dark:border-white/20">
          <div className="h-4 w-24 skeleton-shimmer" />
          <div className="h-4 w-24 skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}
