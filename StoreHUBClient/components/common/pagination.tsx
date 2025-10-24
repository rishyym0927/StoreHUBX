"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { use } from "react";

export function Pagination({
  searchParams,
  totalApprox, // optional for future, not used now
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  totalApprox?: number;
}) {
  const resolved = use(searchParams);
  const router = useRouter();
  const pathname = usePathname();

  const page = Number(resolved.page ?? 1);
  const limit = Number(resolved.limit ?? 10);

  function go(nextPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(Math.max(1, nextPage)));
    params.set("limit", String(limit));
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1 rounded-xl border text-sm disabled:opacity-50"
      >
        Prev
      </button>
      <span className="text-sm opacity-80">Page {page}</span>
      <button
        onClick={() => go(page + 1)}
        className="px-3 py-1 rounded-xl border text-sm"
      >
        Next
      </button>
    </div>
  );
}
