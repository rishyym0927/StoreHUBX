"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

type AuthState = {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clear: () => void;
};

/**
 * Read the `exp` claim out of a JWT without verifying it — the backend is the
 * only thing that can actually validate the signature. This is purely so we
 * don't fire a request we already know will 401.
 *
 * Returns false only when the token is provably expired or unparseable; an
 * absent `exp` is treated as still-valid and left to the server.
 */
export function isTokenValid(token: string | null): boolean {
  if (!token) return false;

  const payload = token.split(".")[1];
  if (!payload) return false;

  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { exp?: number };
    if (typeof claims.exp !== "number") return true;
    return claims.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: "storehub-auth",
      // Nothing else clears the persisted token, so an expired JWT would
      // otherwise sit in localStorage forever and 401 every protected call.
      onRehydrateStorage: () => (state) => {
        if (state && state.token && !isTokenValid(state.token)) {
          state.clear();
        }
      },
    }
  )
);
