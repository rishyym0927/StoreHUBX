"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="brutal-lift border-2 border-black dark:border-white px-6 py-3 text-sm font-mono font-bold disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
      >
        ← PREV
      </button>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
          // Show first page, last page, current page, and pages around current
          const showPage =
            pageNum === 1 ||
            pageNum === totalPages ||
            Math.abs(pageNum - currentPage) <= 1;

          const showEllipsis =
            (pageNum === currentPage - 2 && currentPage > 3) ||
            (pageNum === currentPage + 2 && currentPage < totalPages - 2);

          if (showEllipsis) {
            return (
              <span key={pageNum} className="text-sm font-mono text-black/40 dark:text-white/40 px-3 font-bold">
                •••
              </span>
            );
          }

          if (!showPage) return null;

          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`border-2 px-5 py-3 text-sm font-mono font-bold ${
                pageNum === currentPage
                  ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black shadow-[4px_4px_0px_0px_#1B1712] dark:shadow-[4px_4px_0px_0px_#EFE8D9]"
                  : "brutal-lift border-black dark:border-white"
              }`}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="brutal-lift border-2 border-black dark:border-white px-6 py-3 text-sm font-mono font-bold disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
      >
        NEXT →
      </button>
    </div>
  );
}
