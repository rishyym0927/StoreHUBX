"use client";

import { useEffect, useState } from "react";

/**
 * Click-again-to-confirm pattern for destructive actions: first call arms a
 * 4s confirmation window, second call within that window runs `action`.
 */
export function useConfirmDelete(action: () => Promise<void>, timeoutMs = 4000) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), timeoutMs);
    return () => clearTimeout(timer);
  }, [confirming, timeoutMs]);

  const trigger = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
      setConfirming(false);
    }
  };

  return { confirming, pending, trigger };
}
