// components/common/theme-toggle.tsx
"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const checked = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(checked ? "light" : "dark")}
      className="flex items-center gap-2 text-xs font-mono border border-black dark:border-white px-2 sm:px-3 py-1 transition-transform hover:scale-105 active:scale-95"
      aria-label="Toggle theme"
    >
      <span className="hidden sm:inline">{checked ? "Dark" : "Light"}</span>
      <span className="text-base" aria-hidden="true">
        {checked ? "🌙" : "☀️"}
      </span>
    </button>
  );
}
