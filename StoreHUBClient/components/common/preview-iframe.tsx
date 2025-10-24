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
      <div className="p-4 border rounded-xl opacity-70">
        No preview URL provided.
      </div>
    );
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-white dark:bg-gray-950">
      <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs font-mono border-b flex items-center justify-between">
        <span className="truncate flex-1 text-gray-600 dark:text-gray-400">
          {isLoading ? '⏳ Loading preview...' : '✓ Live Preview'}
        </span>
        {loadError && <span className="text-red-600 ml-2">❌ Error</span>}
        <a 
          href={src} 
          target="_blank" 
          rel="noopener noreferrer"
          className="ml-2 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition"
        >
          Open in new tab ↗
        </a>
      </div>
      
      {loadError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          <p className="font-semibold">Failed to load preview</p>
          <p className="mt-1 text-xs">{loadError}</p>
        </div>
      )}
      
      {/* Warning about MIME type issues */}
      <div className="px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b text-xs">
        <p className="text-yellow-800 dark:text-yellow-200">
          💡 <strong>Note:</strong> If the preview appears blank, check your browser console. 
          MIME type errors mean your backend file server needs to set correct Content-Type headers for .js, .css, and .svg files.
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
