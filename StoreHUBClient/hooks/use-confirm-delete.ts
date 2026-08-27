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

  // Accessibility contract: `confirming` flips the accessible name/content of
  // whatever control renders it (armed on trigger(), auto-disarmed after
  // `timeoutMs`). Consumers must put `aria-live="polite" aria-atomic="true"`
  // on that element so both the arm and the silent expiry get announced —
  // `aria-atomic` is required because the default `aria-relevant` value
  // ("additions text") does not announce removed content, which is what the
  // expiry looks like when e.g. a "Confirm?" text node disappears.
  return { confirming, pending, trigger };
}
