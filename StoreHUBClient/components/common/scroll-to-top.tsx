"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // `html, body { height: 100% }` (globals.css) makes `body`, not `window`,
    // the actual scrolling element here, so a plain `window` scroll listener
    // never fires — listen on `document` and read both possible scroll tops.
    const getScrollTop = () =>
      Math.max(document.documentElement.scrollTop, document.body.scrollTop, window.scrollY);
    const onScroll = () => setVisible(getScrollTop() > 600);
    onScroll();
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  if (!visible) return null;

  const scrollToTop = () => {
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll back to top"
      className="brutal-lift fixed bottom-6 right-6 z-40 w-11 h-11 flex items-center justify-center border-2 border-black dark:border-white bg-white dark:bg-black text-black dark:text-white"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
}
