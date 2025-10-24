"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { use, useMemo, useState } from "react";

const frameworks = ["react", "vue", "svelte", "angular"] as const;

export function ComponentsToolbar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = use(searchParams);
  const router = useRouter();
  const pathname = usePathname();

  const initialQ = typeof resolved.q === "string" ? resolved.q : "";
  const initialFw = typeof resolved.framework === "string" ? resolved.framework : "";

  const [q, setQ] = useState(initialQ);
  const [fw, setFw] = useState(initialFw);

  function apply(next: Partial<{ q: string; framework: string; page: number }>) {
    const params = new URLSearchParams(window.location.search);
    if (next.q !== undefined) {
      next.q ? params.set("q", next.q) : params.delete("q");
    }
    if (next.framework !== undefined) {
      next.framework ? params.set("framework", next.framework) : params.delete("framework");
    }
    // reset page on new filters/search
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply({ q })}
        placeholder="Search components…"
        className="w-full sm:w-80 border rounded-xl p-3 bg-transparent"
      />
      <div className="flex items-center gap-2 flex-wrap">
        {frameworks.map((f) => {
          const active = fw === f;
          return (
            <button
              key={f}
              onClick={() => apply({ framework: active ? "" : f })}
              className={`text-xs px-3 py-1 rounded-full border ${
                active ? "bg-fg text-bg dark:bg-fg-dark dark:text-bg-dark" : ""
              }`}
            >
              {f}
            </button>
          );
        })}
        <button
          onClick={() => apply({ q: "", framework: "" })}
          className="text-xs underline opacity-70 hover:opacity-100"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
