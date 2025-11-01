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
      <div className="border-2 border-black dark:border-white p-8 text-center bg-black/5 dark:bg-white/5">
        <div className="text-4xl mb-3">🖼️</div>
        <p className="font-mono text-sm text-black/60 dark:text-white/60">
          No preview URL provided
        </p>
      </div>
    );
  }

  return (
    <div className="border-2 border-black dark:border-white overflow-hidden bg-white dark:bg-black">
      {/* Enhanced Preview Header */}
      <div className="bg-black dark:bg-white px-4 py-3 border-b-2 border-black dark:border-white flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
          </div>
          <span className="truncate text-xs font-mono text-white dark:text-black">
            {isLoading ? '⏳ Loading preview...' : '✨ Live Preview'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {loadError && (
            <span className="text-xs font-mono text-red-400 dark:text-red-600">
              ⚠️ Error
            </span>
          )}
          <a 
            href={src} 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-3 py-1 text-xs font-mono border-2 border-white dark:border-black text-white dark:text-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all"
          >
            Open in New Tab ↗
          </a>
        </div>
      </div>
      
      {loadError && (
        <div className="p-6 border-b-2 border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950">
          <p className="font-mono font-bold text-red-600 dark:text-red-400 mb-2">
            ⚠️ Preview Failed to Load
          </p>
          <p className="text-xs font-mono text-red-600 dark:text-red-400 mb-3">
            {loadError}
          </p>
          <p className="text-xs font-mono text-red-600/70 dark:text-red-400/70">
            This could be due to CORS restrictions, an invalid URL, or the preview server being unavailable.
          </p>
        </div>
      )}
      
      <div className="relative bg-white dark:bg-gray-950" style={{ minHeight: height }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 dark:bg-black/90 z-10">
            <div className="text-center">
              <div className="inline-block w-10 h-10 border-4 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs font-mono text-black/60 dark:text-white/60">Loading preview...</p>
            </div>
          </div>
        )}
        
        <iframe
          title="Live Preview"
          src={src}
          className="w-full border-0 bg-white"
          style={{ height, display: 'block' }}
          sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          allow="clipboard-read; clipboard-write; geolocation; microphone; camera; web-share; payment"
          onLoad={() => {
            setIsLoading(false);
          }}
          onError={(e) => {
            console.error("❌ Iframe failed to load:", src, e);
            setLoadError("Iframe failed to load - the preview URL may be invalid or blocked by CORS");
            setIsLoading(false);
          }}
        />
      </div>
    </div>
  );
}
