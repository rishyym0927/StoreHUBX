"use client";

import { useState } from "react";

type Tab = { id: string; label: string };

export function Tabs({
  tabs,
  initial = "preview",
  children,
}: {
  tabs: Tab[];
  initial?: string;
  children: (activeId: string) => React.ReactNode;
}) {
  const [active, setActive] = useState(initial);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap border-b border-black dark:border-white">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`font-mono text-xs px-3 py-2 border-b-2 transition-colors ${
                isActive 
                  ? "border-black dark:border-white font-bold" 
                  : "border-transparent text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div>{children(active)}</div>
    </div>
  );
}
