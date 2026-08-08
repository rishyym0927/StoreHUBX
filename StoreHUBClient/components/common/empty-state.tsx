import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "lg";
  variant?: "default" | "error";
}

export function EmptyState({ icon: Icon, title, description, action, size = "sm", variant = "default" }: EmptyStateProps) {
  const isLarge = size === "lg";
  const isError = variant === "error";

  return (
    <div
      className={`border-2 text-center ${
        isError
          ? "border-red-600 dark:border-red-400 bg-red-50 dark:bg-red-950"
          : "border-black dark:border-white"
      } ${isLarge ? "p-12 sm:p-20" : "p-10 sm:p-12"}`}
    >
      <div className={`mx-auto space-y-4 ${isLarge ? "max-w-lg space-y-6" : ""}`}>
        <Icon
          className={`mx-auto stroke-1 ${isError ? "text-red-600 dark:text-red-400" : ""} ${
            isLarge ? "w-16 h-16 sm:w-24 sm:h-24" : "w-12 h-12 sm:w-16 sm:h-16"
          }`}
        />
        <div>
          <h3
            className={`font-black uppercase tracking-tighter ${
              isError ? "text-red-700 dark:text-red-300" : ""
            } ${isLarge ? "text-3xl sm:text-4xl mb-3" : "text-xl sm:text-2xl mb-2"}`}
          >
            {title}
          </h3>
          {description && (
            <p
              className={`text-sm font-mono leading-relaxed ${
                isError ? "text-red-600 dark:text-red-400" : "text-black/70 dark:text-white/70"
              }`}
            >
              {description}
            </p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}
