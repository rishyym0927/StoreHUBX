"use client";

import Link from "next/link";
import * as Avatar from "@radix-ui/react-avatar";
import { Component } from "@/types";

interface UserProfileCardProps {
  ownerId: string;
  ownerName?: string;
  ownerUsername?: string;
  ownerAvatar?: string;
  otherComponents?: Component[];
}

export function UserProfileCard({
  ownerId,
  ownerName,
  ownerUsername,
  ownerAvatar,
  otherComponents = [],
}: UserProfileCardProps) {
  const displayName = ownerUsername || ownerName || "Unknown User";
  const initials = (ownerUsername?.[0] || ownerName?.[0] || "U").toUpperCase();
  
  return (
    <div className="space-y-4 pb-4 border-b-2 border-black dark:border-white">
      {/* Owner Header */}
      <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider">
        Owner
      </div>

      {/* Owner Profile */}
      <Link
        href={`/users/${ownerId}`}
        className="flex items-start gap-3 group hover:opacity-80 transition-opacity"
      >
        <Avatar.Root className="w-12 h-12 border-2 border-black dark:border-white overflow-hidden bg-black dark:bg-white shrink-0">
          <Avatar.Image
            src={ownerAvatar}
            alt={displayName}
            className="object-cover w-full h-full"
          />
          <Avatar.Fallback className="bg-black dark:bg-white text-white dark:text-black text-lg font-bold flex items-center justify-center w-full h-full">
            {initials}
          </Avatar.Fallback>
        </Avatar.Root>

        <div className="flex-1 min-w-0">
          <h3 className="font-mono font-bold text-sm truncate group-hover:underline">
            {displayName}
          </h3>
          <p className="text-xs font-mono text-black/60 dark:text-white/60 mt-0.5">
            {otherComponents.length} component{otherComponents.length !== 1 ? "s" : ""}
          </p>
        </div>
      </Link>

      {/* Other Components by User */}
      {otherComponents.length > 0 && (
        <div className="space-y-2 mt-4 pt-4 border-t border-black/20 dark:border-white/20">
          <div className="text-xs font-mono text-black/60 dark:text-white/60">
            More by {ownerUsername || "this author"}:
          </div>
          <div className="space-y-1.5">
            {otherComponents.slice(0, 5).map((comp) => (
              <Link
                key={comp.id}
                href={`/components/${comp.slug}`}
                className="block group"
              >
                <div className="text-xs font-mono hover:bg-black/5 dark:hover:bg-white/5 p-2 -mx-2 rounded transition-colors">
                  <div className="font-bold group-hover:underline truncate">
                    {comp.name}
                  </div>
                  {comp.description && (
                    <div className="text-black/60 dark:text-white/60 truncate mt-0.5">
                      {comp.description}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
          {otherComponents.length > 5 && (
            <Link
              href={`/users/${ownerId}`}
              className="block text-xs font-mono text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:underline pt-2"
            >
              + {otherComponents.length - 5} more
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
