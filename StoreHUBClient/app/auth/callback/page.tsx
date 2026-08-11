"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/store";

export default function AuthCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    const encodedUser = params.get("user"); // base64 of JSON

    if (token && encodedUser) {
      try {
        const user = JSON.parse(atob(encodedUser));
        setAuth(token, user);
        router.replace("/");
      } catch (err) {
        console.error("Invalid user payload:", err);
        setError("Sign-in failed: the callback data was malformed.");
        setTimeout(() => router.replace("/"), 2000);
      }
    } else {
      console.warn("Missing token or user data in callback URL");
      setError("Sign-in failed: missing authentication data.");
      setTimeout(() => router.replace("/"), 2000);
    }
  }, [params, router, setAuth]);

  return (
    <div className="py-20 text-center opacity-80">
      {error ?? "Completing sign-in…"}
    </div>
  );
}
