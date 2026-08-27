"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const ICON_COLORS: Record<ToastVariant, string> = {
  success: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-black dark:text-white",
};

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // Hover and focus can overlap (e.g. mouse resting over a toast while its
  // dismiss button has keyboard focus) — track each reason independently so
  // the timer only resumes once BOTH have cleared, not on whichever fires last.
  const activeInteractionsRef = useRef<Map<number, Set<"hover" | "focus">>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    activeInteractionsRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: number) => {
      const timer = timersRef.current.get(id);
      if (timer) clearTimeout(timer);
      timersRef.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
    },
    [dismiss]
  );

  const pauseDismiss = useCallback((id: number, reason: "hover" | "focus") => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    let reasons = activeInteractionsRef.current.get(id);
    if (!reasons) {
      reasons = new Set();
      activeInteractionsRef.current.set(id, reasons);
    }
    reasons.add(reason);
  }, []);

  const resumeDismiss = useCallback(
    (id: number, reason: "hover" | "focus") => {
      const reasons = activeInteractionsRef.current.get(id);
      reasons?.delete(reason);
      if (reasons && reasons.size > 0) return;
      activeInteractionsRef.current.delete(id);
      scheduleDismiss(id);
    },
    [scheduleDismiss]
  );

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, variant }]);
      scheduleDismiss(id);
    },
    [scheduleDismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICONS[t.variant];
          return (
            <div
              key={t.id}
              role={t.variant === "error" ? "alert" : "status"}
              onMouseEnter={() => pauseDismiss(t.id, "hover")}
              onMouseLeave={() => resumeDismiss(t.id, "hover")}
              onFocus={() => pauseDismiss(t.id, "focus")}
              onBlur={() => resumeDismiss(t.id, "focus")}
              className="animate-page-in pointer-events-auto flex items-start gap-3 border-2 border-black dark:border-white bg-white dark:bg-black text-black dark:text-white px-4 py-3 shadow-[4px_4px_0px_0px_#1B1712] dark:shadow-[4px_4px_0px_0px_#EFE8D9] font-mono text-sm"
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${ICON_COLORS[t.variant]}`} />
              <p className="flex-1 leading-snug break-words">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 hover:opacity-60 focus-visible:opacity-60"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
