"use client";

import { useAuth } from "@/lib/store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (hydrated && !token) router.replace("/");
  }, [hydrated, token, router]);

  if (!hydrated) {
    return (
      <div className="py-24 text-center text-base font-mono opacity-70">
        <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <div>Loading user session...</div>
      </div>
    );
  }
  if (!token) return null;

  return <>{children}</>;
}
