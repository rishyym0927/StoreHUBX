interface BadgeProps {
  children: React.ReactNode;
  variant: "framework" | "tag";
}

export function Badge({ children, variant }: BadgeProps) {
  if (variant === "framework") {
    return (
      <span className="px-2.5 py-1 border border-black dark:border-white text-xs font-mono font-bold uppercase tracking-wide hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors">
        {children}
      </span>
    );
  }

  return (
    <span className="text-xs font-mono text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors">
      #{children}
    </span>
  );
}
