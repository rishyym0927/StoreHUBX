"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/store";

export default function AuthCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);

  useEffect(() => {
    const token = params.get("token");
    const encodedUser = params.get("user"); // base64 of JSON

    if (token && encodedUser) {
      try {
        const user = JSON.parse(atob(encodedUser));
        console.log("Setting auth with token and user data:", { token, user });
        setAuth(token, user);
        router.replace("/");
      } catch (error) {
        console.error("Invalid user payload:", error);
        router.replace("/");
      }
    } else {
      console.warn("Missing token or user data in callback URL");
      // If your backend returns raw JSON instead of redirect with params, handle that flow separately
      router.replace("/");
    }
  }, [params, router, setAuth]);

  return (
    <div className="py-20 text-center opacity-80">
      Completing sign-in…
    </div>
  );
}
