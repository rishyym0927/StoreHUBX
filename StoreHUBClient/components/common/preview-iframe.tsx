"use client";

import { useMemo, useState, useEffect } from "react";

type Props = {
  url?: string | null;
  height?: number;
};

/** Provider-aware embed with safe defaults. */
export function PreviewIframe({ url, height = 520 }: Props) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const src = useMemo(() => {
    if (!url) {
      return "";
    }
    
    const u = new URL(url);
    const host = u.hostname;

    // Normalize common providers to embed URLs
    if (host.includes("codesandbox.io")) {
      // Accept both sandbox and embed links
      // ex: https://codesandbox.io/s/slug -> https://codesandbox.io/embed/slug
      if (!u.pathname.startsWith("/embed/")) {
        u.pathname = `/embed${u.pathname}`;
      }
      u.searchParams.set("fontsize", "14");
      u.searchParams.set("hidenavigation", "1");
      u.searchParams.set("theme", "dark");
      return u.toString();
    }
    if (host.includes("stackblitz.com")) {
      // ex: https://stackblitz.com/edit/slug -> /embed/slug
      if (!u.pathname.startsWith("/embed/")) {
        u.pathname = `/embed${u.pathname}`;
      }
      return u.toString();
    }
    if (host.includes("codepen.io") && !u.pathname.includes("/embed/")) {
      // ex: https://codepen.io/user/pen/xyz -> /embed/xyz
      const parts = u.pathname.split("/");
      const penId = parts[parts.length - 1] || "";
      u.pathname = `/embed/${penId}`;
      return u.toString();
    }
    // Otherwise render as-is (GitHub Pages, Vercel preview, etc.)
    return url;
  }, [url]);
  
  // Test if URL is accessible
  useEffect(() => {
    if (!src) return;
    
    setIsLoading(true);
    setLoadError(null);
    
    // Try to fetch the URL to see if it's accessible
    fetch(src, { method: 'HEAD', mode: 'no-cors' })
      .then(() => {
        setIsLoading(false);
      })
      .catch(err => {
        console.error("❌ Preview URL is not accessible:", src, err);
        setLoadError(`Cannot access preview: ${err.message}`);
        setIsLoading(false);
      });
  }, [src]);

  if (!src) {
    return (
      <div className="p-4 border border-black dark:border-white">
        <p className="font-mono text-sm text-black/60 dark:text-white/60">
          No preview URL provided
        </p>
      </div>
    );
  }

  return (
    <div className="border border-black dark:border-white overflow-hidden">
      <div className="bg-black dark:bg-white px-3 py-2 text-xs font-mono border-b border-black dark:border-white flex items-center justify-between">
        <span className="truncate flex-1 text-white dark:text-black">
          {isLoading ? 'Loading preview...' : 'Live Preview'}
        </span>
        {loadError && <span className="text-red-400 dark:text-red-600 ml-2">Error</span>}
        <a 
          href={src} 
          target="_blank" 
          rel="noopener noreferrer"
          className="ml-2 px-2 py-1 text-xs border border-white dark:border-black text-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition"
        >
          Open ↗
        </a>
      </div>
      
      {loadError && (
        <div className="p-4 border-b border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950 text-sm">
          <p className="font-mono font-bold text-red-600 dark:text-red-400">Failed to load preview</p>
          <p className="mt-1 text-xs font-mono text-red-600 dark:text-red-400">{loadError}</p>
        </div>
      )}
      
      {/* Warning about MIME type issues */}
      <div className="px-3 py-2 border-b border-black dark:border-white text-xs">
        <p className="font-mono text-black/70 dark:text-white/70">
          💡 If the preview appears blank, check your browser console for MIME type errors.
        </p>
      </div>
      
      <div className="relative" style={{ minHeight: height }}>
        <iframe
          title="Live Preview"
          src={src}
          className="w-full border-0"
          style={{ height, display: 'block' }}
          // NOTE: Allow list is generous for dev tools like CodeSandbox/StackBlitz.
          // If you need stronger isolation, remove allow-same-origin (but some embeds may break).
          sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          allow="clipboard-read; clipboard-write; geolocation; microphone; camera; web-share; payment"
          onLoad={() => {
            setIsLoading(false);
          }}
          onError={(e) => {
            console.error("❌ Iframe failed to load:", src, e);
            setLoadError("Iframe failed to load");
          }}
        />
      </div>
    </div>
  );
}
