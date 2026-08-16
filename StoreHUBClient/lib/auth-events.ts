/**
 * Tiny indirection so `lib/api.ts` (imported from server components too) can
 * signal "this token is dead" without importing the client-only auth store.
 * `components/common/session-guard.tsx` registers the handler on mount.
 */

type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  handler = fn;
}

export function onUnauthorized() {
  handler?.();
}
