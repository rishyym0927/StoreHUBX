export function ComponentCardSkeleton() {
  return (
    <div className="border-2 border-black dark:border-white animate-pulse">
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-6 sm:h-7 bg-black/10 dark:bg-white/10 w-2/3" />
            <div className="h-4 bg-black/10 dark:bg-white/10 w-full" />
          </div>
          <div className="h-7 w-20 bg-black/10 dark:bg-white/10 shrink-0" />
        </div>

        {/* Frameworks */}
        <div className="flex gap-2 pt-2 border-t border-black/20 dark:border-white/20">
          <div className="h-6 w-16 bg-black/10 dark:bg-white/10" />
          <div className="h-6 w-20 bg-black/10 dark:bg-white/10" />
        </div>

        {/* Tags */}
        <div className="flex gap-2">
          <div className="h-4 w-12 bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-16 bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-10 bg-black/10 dark:bg-white/10" />
        </div>

        {/* Footer */}
        <div className="flex gap-4 pt-4 border-t border-black/20 dark:border-white/20">
          <div className="h-4 w-24 bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-24 bg-black/10 dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}
