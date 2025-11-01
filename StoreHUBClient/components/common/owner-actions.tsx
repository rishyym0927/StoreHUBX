"use client";

import { userApi } from "@/lib/api";
import { useAuth } from "@/lib/store";
import Link from "next/link";
import React from "react";

interface OwnerActionsProps {
  ownerId: string;
  componentSlug: string;
  isLinked: boolean;
}

export function OwnerActions({ ownerId, componentSlug, isLinked }: OwnerActionsProps) {
  
  const token = useAuth((s) => s.token);
  const [isOwner, setIsOwner] = React.useState(false);

  React.useEffect(() => {
    async function checkOwnership() {
      if (token) {
        const userProfile = await userApi.getProfile(token);
        setIsOwner(userProfile.user.providerId === ownerId);
      }
    }
    checkOwnership();
  }, [token, ownerId]);

  

  console.log("isOwner:", isOwner, token, ownerId);

  // If not owner or not logged in, don't show any actions
  if (!isOwner) {
    return (
      <div className="text-center py-6">
        <p className="text-sm font-mono text-black/60 dark:text-white/60">
          🔒 Only the component owner can manage this component
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Link
        href={`/components/${componentSlug}/import`}
        className="block w-full text-center border-2 border-black dark:border-white px-4 py-3 text-sm font-mono transition-transform hover:scale-105 active:scale-95"
      >
        {isLinked ? "Change Repository" : "Link GitHub"}
      </Link>
      
      {isLinked && (
        <Link
          href={`/components/${componentSlug}/new-version`}
          className="block w-full text-center border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-4 py-3 text-sm font-mono transition-transform hover:scale-105 active:scale-95"
        >
          Add New Version
        </Link>
      )}
    </div>
  );
}
