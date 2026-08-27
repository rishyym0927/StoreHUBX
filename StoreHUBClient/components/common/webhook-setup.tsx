"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/store";
import { webhookApi } from "@/lib/api";
import { CopyButton } from "@/components/common/copy-button";

const MASKED_SECRET = "•".repeat(24);

interface WebhookSetupProps {
  slug: string;
}

export function WebhookSetup({ slug }: WebhookSetupProps) {
  const token = useAuth((s) => s.token);
  const [config, setConfig] = useState<{ webhookUrl: string; webhookSecret: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretRevealed, setSecretRevealed] = useState(false);

  const loadConfig = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await webhookApi.getConfig(slug, token);
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhook config");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-black dark:border-white">
      <details className="text-sm" onToggle={(e) => {
        const open = (e.target as HTMLDetailsElement).open;
        if (open && !config) loadConfig();
        if (!open) setSecretRevealed(false);
      }}>
        <summary className="cursor-pointer font-mono text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white">
          Set up push-to-deploy (GitHub webhook)
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs font-mono text-black/60 dark:text-white/60">
            Add this as a webhook in your GitHub repo (Settings → Webhooks → Add webhook),
            content type <span className="font-bold">application/json</span>. Every push will
            deploy automatically.
          </p>

          {loading && <p className="text-xs font-mono">Loading...</p>}
          {error && <p className="text-xs font-mono text-red-600 dark:text-red-400">{error}</p>}

          {config && (
            <>
              <div className="space-y-1">
                <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase">Payload URL</div>
                <div className="relative">
                  <div className="font-mono text-xs bg-black dark:bg-white text-white dark:text-black p-3 pr-24 overflow-x-auto">
                    {config.webhookUrl}
                  </div>
                  <CopyButton value={config.webhookUrl} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase">Secret</div>
                <div className="relative">
                  <div className="font-mono text-xs bg-black dark:bg-white text-white dark:text-black p-3 pr-56 overflow-x-auto">
                    {secretRevealed ? config.webhookSecret : MASKED_SECRET}
                  </div>
                  <button
                    onClick={() => setSecretRevealed((v) => !v)}
                    className="absolute right-32 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-mono border border-white dark:border-black bg-white dark:bg-black text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    title={secretRevealed ? "Hide secret" : "Show secret"}
                  >
                    <span className="inline-flex items-center gap-1">
                      {secretRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {secretRevealed ? "Hide" : "Show"}
                    </span>
                  </button>
                  <CopyButton value={config.webhookSecret} />
                </div>
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
