"use client";

import { useState } from "react";
import { useAuth } from "@/lib/store";
import { webhookApi } from "@/lib/api";
import { Check } from "lucide-react";

interface WebhookSetupProps {
  slug: string;
}

export function WebhookSetup({ slug }: WebhookSetupProps) {
  const token = useAuth((s) => s.token);
  const [config, setConfig] = useState<{ webhookUrl: string; webhookSecret: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "secret" | null>(null);

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

  const copy = async (value: string, which: "url" | "secret") => {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
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
                  <div className="font-mono text-xs bg-black dark:bg-white text-white dark:text-black p-3 pr-20 overflow-x-auto">
                    {config.webhookUrl}
                  </div>
                  <button
                    onClick={() => copy(config.webhookUrl, "url")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-mono border border-white dark:border-black bg-white dark:bg-black text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  >
                    {copied === "url" ? (<span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Copied</span>) : "Copy"}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase">Secret</div>
                <div className="relative">
                  <div className="font-mono text-xs bg-black dark:bg-white text-white dark:text-black p-3 pr-20 overflow-x-auto">
                    {config.webhookSecret}
                  </div>
                  <button
                    onClick={() => copy(config.webhookSecret, "secret")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-mono border border-white dark:border-black bg-white dark:bg-black text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  >
                    {copied === "secret" ? (<span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Copied</span>) : "Copy"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
