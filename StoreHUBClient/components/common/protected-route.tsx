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
      <div className="py-20 text-center opacity-70 text-sm">
        Loading user session...
      </div>
    );
  }
  if (!token) return null;

  return <>{children}</>;
}
