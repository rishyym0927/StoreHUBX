"use client";

import { useState } from "react";
import { useAuth } from "@/lib/store";
import { webhookApi } from "@/lib/api";
import { CopyButton } from "@/components/common/copy-button";

interface WebhookSetupProps {
  slug: string;
}

export function WebhookSetup({ slug }: WebhookSetupProps) {
  const token = useAuth((s) => s.token);
  const [config, setConfig] = useState<{ webhookUrl: string; webhookSecret: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if ((e.target as HTMLDetailsElement).open && !config) loadConfig();
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
                  <div className="font-mono text-xs bg-black dark:bg-white text-white dark:text-black p-3 pr-24 overflow-x-auto">
                    {config.webhookSecret}
                  </div>
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
