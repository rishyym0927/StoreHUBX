"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/components/common/toast";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label = "Copy", className = "" }: CopyButtonProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Failed to copy to clipboard", "error");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-mono border border-white dark:border-black bg-white dark:bg-black text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <span className="inline-flex items-center gap-1">
          <Check className="w-3 h-3" /> Copied
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          <Copy className="w-3 h-3" /> {label}
        </span>
      )}
    </button>
  );
}
