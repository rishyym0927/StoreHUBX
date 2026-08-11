"use client";

import * as Avatar from "@radix-ui/react-avatar";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  xs: "w-6 h-6 text-xs",
  sm: "w-8 h-8 text-sm",
  md: "w-12 h-12 text-lg",
  lg: "w-24 h-24 sm:w-32 sm:h-32 text-4xl sm:text-5xl",
  xl: "w-32 h-32 text-5xl",
};

export function UserAvatar({ src, name, size = "md", className = "" }: UserAvatarProps) {
  const initial = (name?.[0] || "U").toUpperCase();

  return (
    <Avatar.Root
      className={`shrink-0 border-2 border-black dark:border-white overflow-hidden bg-black dark:bg-white ${SIZE_CLASSES[size]} ${className}`}
    >
      <Avatar.Image src={src ?? undefined} alt={name || "User"} className="object-cover w-full h-full" />
      <Avatar.Fallback className="bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center w-full h-full">
        {initial}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}
