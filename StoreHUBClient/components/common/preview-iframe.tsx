"use client";

import { useMemo, useState, useEffect } from "react";
import { ImageOff, Loader2, Sparkles, AlertTriangle } from "lucide-react";

type Props = {
  url?: string | null;
  height?: number;
};

/** Provider-aware embed with safe defaults. */
export function PreviewIframe({ url, height = 520 }: Props) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const { src, invalidUrl } = useMemo(() => {
    if (!url) {
      return { src: "", invalidUrl: false };
    }

    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { src: "", invalidUrl: true };
    }
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
      return { src: u.toString(), invalidUrl: false };
    }
    if (host.includes("stackblitz.com")) {
      // ex: https://stackblitz.com/edit/slug -> /embed/slug
      if (!u.pathname.startsWith("/embed/")) {
        u.pathname = `/embed${u.pathname}`;
      }
      return { src: u.toString(), invalidUrl: false };
    }
    if (host.includes("codepen.io") && !u.pathname.includes("/embed/")) {
      // ex: https://codepen.io/user/pen/xyz -> /embed/xyz
      const parts = u.pathname.split("/");
      const penId = parts[parts.length - 1] || "";
      u.pathname = `/embed/${penId}`;
      return { src: u.toString(), invalidUrl: false };
    }
    // Otherwise render as-is (GitHub Pages, Vercel preview, etc.)
    return { src: url, invalidUrl: false };
  }, [url]);
  
  // Reset loading/error state whenever the preview URL changes; the iframe's
  // own onLoad/onError below are the source of truth for reachability.
  useEffect(() => {
    if (!src) return;
    setIsLoading(true);
    setLoadError(null);
  }, [src]);

  if (!src) {
    return (
      <div className="border-2 border-black dark:border-white p-8 text-center bg-black/5 dark:bg-white/5">
        <ImageOff className="w-10 h-10 mb-3 mx-auto stroke-1" />
        <p className="font-mono text-sm text-black/60 dark:text-white/60">
          {invalidUrl ? "Preview URL is invalid" : "No preview URL provided"}
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
          <span className="truncate text-xs font-mono text-white dark:text-black flex items-center gap-1.5">
            {isLoading ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading preview...</>) : (<><Sparkles className="w-3.5 h-3.5" /> Live Preview</>)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {loadError && (
            <span className="text-xs font-mono text-red-400 dark:text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Error
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
          <p className="font-mono font-bold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Preview Failed to Load
          </p>
          <p className="text-xs font-mono text-red-600 dark:text-red-400 mb-3">
            {loadError}
          </p>
          <p className="text-xs font-mono text-red-600/70 dark:text-red-400/70">
            This could be due to CORS restrictions, an invalid URL, or the preview server being unavailable.
          </p>
        </div>
      )}
      
      <div className="relative bg-white dark:bg-black" style={{ minHeight: height }}>
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
            console.error("Iframe failed to load:", src, e);
            setLoadError("Iframe failed to load - the preview URL may be invalid or blocked by CORS");
            setIsLoading(false);
          }}
        />
      </div>
    </div>
  );
}
