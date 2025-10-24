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
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`font-black uppercase tracking-wide text-xs px-5 py-2.5 border-2 transition-all duration-200 ${
                isActive 
                  ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white scale-105" 
                  : "bg-white dark:bg-black text-black dark:text-white border-black dark:border-white hover:scale-105"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="border-t-2 border-black dark:border-white pt-6">{children(active)}</div>
    </div>
  );
}
