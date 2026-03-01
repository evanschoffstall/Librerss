"use client";

import { ArticleService } from "@/lib/api/services";
import { Shield, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";

export function SettingsProxySection() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    ArticleService.getProxyStatus()
      .then((status) => setConfigured(status.configured))
      .catch(() => setConfigured(false));
  }, []);

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h3 className="font-semibold">Extraction Proxy</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Route article extraction through a proxy to bypass restrictions.
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        {configured === null ? (
          <span className="text-muted-foreground">Checking…</span>
        ) : configured ? (
          <>
            <Shield className="size-4 text-green-600 dark:text-green-400" />
            <span>Proxy configured and available.</span>
          </>
        ) : (
          <>
            <ShieldOff className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              No proxy configured. Set{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                ARTICLE_EXTRACT_PROXY_URL
              </code>{" "}
              to enable.
            </span>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Per-feed proxy is toggled via the shield icon on each feed above.
      </p>
    </section>
  );
}
