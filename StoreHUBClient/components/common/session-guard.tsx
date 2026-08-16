"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/store";
import { useToast } from "@/components/common/toast";
import { setUnauthorizedHandler } from "@/lib/auth-events";

/**
 * Bridges `apiFetch`'s 401 signal to the auth store: any authenticated request
 * rejected by the backend logs the user out once and tells them why, instead
 * of leaving a dead token in localStorage that fails every subsequent call.
 */
export function SessionGuard() {
  const { showToast } = useToast();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Only react the first time — a page can fire several protected calls
      // at once and they would all land here.
      if (!useAuth.getState().token) return;
      useAuth.getState().clear();
      showToast("Your session expired. Please sign in again.", "error");
    });
    return () => setUnauthorizedHandler(null);
  }, [showToast]);

  return null;
}
