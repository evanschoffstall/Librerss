"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ArticleService } from "@/lib/api/services";
import {
  Globe,
  Save,
  Shield,
  ShieldAlert,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ProxyUIStatus =
  | "loading"
  | "none"
  | "checking"
  | "reachable"
  | "unreachable";

function ProxySkeleton() {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-1 h-3 w-64" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-8 shrink-0" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-4 w-48" />
      </div>
    </section>
  );
}

export function SettingsProxySection() {
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyStatus, setProxyStatus] = useState<ProxyUIStatus>("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowInsecureTls, setAllowInsecureTls] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ArticleService.getProxySettings()
      .then((result) => {
        setProxyUrl(result.proxyUrl ?? "");
        setAllowInsecureTls(result.allowInsecureTls ?? false);
        if (!result.proxyUrl) setProxyStatus("none");
        else
          setProxyStatus(
            result.status ?? (result.configured ? "reachable" : "unreachable"),
          );
        if (result.error) setError(result.error);
      })
      .catch(() => setProxyStatus("none"));
  }, []);

  if (proxyStatus === "loading") return <ProxySkeleton />;

  const handleSave = async () => {
    const trimmed = proxyUrl.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    setProxyStatus("checking");
    try {
      const result = await ArticleService.saveProxyUrl(trimmed, {
        allowInsecureTls,
      });
      setProxyUrl(result.proxyUrl ?? "");
      if (result.error) {
        setError(result.error);
        setProxyStatus("unreachable");
      } else if (!result.proxyUrl) {
        setProxyStatus("none");
      } else {
        setProxyStatus(
          result.status ?? (result.configured ? "reachable" : "unreachable"),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save proxy URL");
      setProxyStatus("unreachable");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError(null);
    try {
      await ArticleService.saveProxyUrl(null);
      setProxyUrl("");
      setProxyStatus("none");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to clear proxy URL",
      );
    } finally {
      setSaving(false);
    }
  };

  const hasProxy =
    proxyStatus === "reachable" ||
    proxyStatus === "unreachable" ||
    proxyStatus === "checking";

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <Globe className="size-3.5 text-muted-foreground" />
          Extraction Proxy
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Route article extraction through a proxy to bypass restrictions.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="text"
          placeholder="http://proxy:8080, socks5://proxy:1080, or 1.2.3.4:8080"
          value={proxyUrl}
          onChange={(e) => {
            setProxyUrl(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          disabled={saving}
          className="h-8 text-sm font-mono"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          onClick={handleSave}
          disabled={saving || !proxyUrl.trim()}
        >
          <Save className="size-3.5" />
        </Button>
        {hasProxy && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 text-destructive hover:text-destructive"
            onClick={handleClear}
            disabled={saving}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor="allow-insecure-tls"
          className="text-xs text-muted-foreground cursor-pointer"
        >
          Allow insecure TLS (skip certificate validation)
        </Label>
        <Switch
          id="allow-insecure-tls"
          checked={allowInsecureTls}
          disabled={saving}
          onCheckedChange={async (checked) => {
            const currentUrl = proxyUrl.trim();
            if (!currentUrl) return;
            setAllowInsecureTls(checked);
            try {
              await ArticleService.saveProxyUrl(currentUrl, {
                allowInsecureTls: checked,
              });
            } catch {
              setAllowInsecureTls(!checked);
            }
          }}
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        {proxyStatus === "checking" ? (
          <>
            <ShieldAlert className="size-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-600 dark:text-yellow-400">
              Assessing proxy connectivity…
            </span>
          </>
        ) : proxyStatus === "reachable" ? (
          <>
            <Shield className="size-4 text-green-600 dark:text-green-400" />
            <span>
              Proxy reachable. Toggle per-feed via the shield icon above.
            </span>
          </>
        ) : proxyStatus === "unreachable" && proxyUrl.trim() ? (
          <>
            <ShieldAlert className="size-4 text-destructive" />
            <span className="text-destructive">
              Proxy saved but unreachable. Check the address and try again.
            </span>
          </>
        ) : (
          <>
            <ShieldOff className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">No proxy configured.</span>
          </>
        )}
      </div>
    </section>
  );
}
