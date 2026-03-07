"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArticleService } from "@/lib/api/services";
import {
  Bug,
  CheckCircle2,
  Globe,
  Info,
  Loader2,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ProxyUIStatus =
  | "loading"
  | "none"
  | "checking"
  | "reachable"
  | "unreachable";

type BotResult = {
  protection: string;
  success: boolean;
  blocked: boolean;
  statusCode?: number;
  error?: string;
};

function StatusBadge({
  status,
}: {
  status: Exclude<ProxyUIStatus, "loading">;
}) {
  if (status === "none") return null;
  const cfg = {
    checking: {
      label: "Checking",
      cls: "text-yellow-600 border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400",
    },
    reachable: {
      label: "Connected",
      cls: "text-green-600 border-green-400/40 bg-green-50 dark:bg-green-950/30 dark:text-green-400",
    },
    unreachable: {
      label: "Unreachable",
      cls: "text-destructive border-destructive/30 bg-destructive/5",
    },
  }[status];
  return (
    <Badge
      variant="outline"
      className={`h-5 gap-1 px-1.5 text-[10px] font-medium ${cfg.cls}`}
    >
      {status === "checking" && <Loader2 className="size-2.5 animate-spin" />}
      {status === "reachable" && <CheckCircle2 className="size-2.5" />}
      {status === "unreachable" && <XCircle className="size-2.5" />}
      {cfg.label}
    </Badge>
  );
}

function BotResultBadge({ result }: { result: BotResult }) {
  const base = "h-5 shrink-0 px-1.5 text-[10px]";
  if (result.success && !result.blocked) {
    return (
      <Badge
        variant="outline"
        className={`${base} border-green-400/40 bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400`}
      >
        Passed
      </Badge>
    );
  }
  if (result.blocked && result.statusCode && result.statusCode > 0) {
    return (
      <Badge
        variant="outline"
        className={`${base} border-yellow-400/40 bg-yellow-50 text-yellow-600 dark:bg-yellow-950/30 dark:text-yellow-400`}
      >
        Blocked
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`${base} border-destructive/30 bg-destructive/5 text-destructive`}
    >
      {result.error ? "Connection Error" : "Failed"}
    </Badge>
  );
}

function ProxySkeleton() {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-9 w-full" />
    </section>
  );
}

export function SettingsProxySection() {
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyStatus, setProxyStatus] = useState<ProxyUIStatus>("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowInsecureTls, setAllowInsecureTls] = useState(false);
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");
  const [hasProxyPassword, setHasProxyPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [testingBot, setTestingBot] = useState(false);
  const [botResults, setBotResults] = useState<BotResult[] | null>(null);
  const [botError, setBotError] = useState<string | null>(null);

  useEffect(() => {
    ArticleService.getProxySettings()
      .then((result) => {
        setProxyUrl(result.proxyUrl ?? "");
        setAllowInsecureTls(result.allowInsecureTls ?? false);
        setProxyUsername(result.proxyUsername ?? "");
        setHasProxyPassword(result.hasProxyPassword ?? false);
        setProxyStatus(
          !result.proxyUrl
            ? "none"
            : (result.status ??
                (result.configured ? "reachable" : "unreachable")),
        );
        if (result.error) setError(result.error);
      })
      .catch(() => setProxyStatus("none"));
  }, []);

  if (proxyStatus === "loading") return <ProxySkeleton />;

  const hasProxy =
    proxyStatus === "reachable" ||
    proxyStatus === "unreachable" ||
    proxyStatus === "checking";

  const handleSave = async () => {
    const trimmed = proxyUrl.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    setProxyStatus("checking");
    try {
      const result = await ArticleService.saveProxyUrl(trimmed, {
        allowInsecureTls,
        proxyUsername: proxyUsername.trim() || null,
        proxyPassword: proxyPassword || null,
      });
      setProxyUrl(result.proxyUrl ?? "");
      setProxyUsername(result.proxyUsername ?? "");
      setHasProxyPassword(result.hasProxyPassword ?? false);
      if (proxyPassword) setProxyPassword("");
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
      await ArticleService.saveProxyUrl(null, {
        proxyUsername: null,
        proxyPassword: null,
      });
      setProxyUrl("");
      setProxyUsername("");
      setProxyPassword("");
      setHasProxyPassword(false);
      setProxyStatus("none");
      setBotResults(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to clear proxy URL",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTestBotDetection = async () => {
    setTestingBot(true);
    setBotResults(null);
    setBotError(null);
    setError(null);
    try {
      const response = await ArticleService.testBotDetection({
        useProxy: hasProxy,
      });
      setBotResults(response.results);
    } catch (err) {
      setBotError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestingBot(false);
    }
  };

  return (
    <section className="rounded-lg border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Globe className="size-3.5 text-muted-foreground" />
            Extraction Proxy
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Route article extraction through a proxy to bypass geo-restrictions
            or bot detection.
          </p>
        </div>
        <StatusBadge status={proxyStatus} />
      </div>

      <Separator />

      {/* URL input */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Proxy URL</Label>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="text"
            placeholder="http://proxy:8080  ·  socks5://proxy:1080  ·  1.2.3.4:8080"
            value={proxyUrl}
            onChange={(e) => {
              setProxyUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            disabled={saving}
            className="h-9 font-mono text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 shrink-0 gap-1.5"
            onClick={handleSave}
            disabled={saving || !proxyUrl.trim()}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save
          </Button>
          {hasProxy && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9 px-2 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleClear}
              disabled={saving}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <XCircle className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label
            htmlFor="proxy-username"
            className="text-xs text-muted-foreground"
          >
            Username
          </Label>
          <Input
            id="proxy-username"
            type="text"
            autoComplete="username"
            placeholder="optional"
            value={proxyUsername}
            onChange={(e) => setProxyUsername(e.target.value)}
            disabled={saving}
            className="h-9 font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="proxy-password"
            className="text-xs text-muted-foreground"
          >
            Password
            {hasProxyPassword && !proxyPassword && (
              <span className="text-muted-foreground/60"> · saved</span>
            )}
          </Label>
          <Input
            id="proxy-password"
            type="password"
            autoComplete="current-password"
            placeholder={hasProxyPassword ? "leave blank to keep" : "optional"}
            value={proxyPassword}
            onChange={(e) => setProxyPassword(e.target.value)}
            disabled={saving}
            className="h-9 font-mono text-sm"
          />
        </div>
      </div>

      <Separator />

      {/* TLS toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor="allow-insecure-tls"
            className="cursor-pointer text-xs"
          >
            Allow insecure TLS
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-44 text-xs">
                Skips certificate validation. Use only for trusted private
                proxies.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
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

      <Separator />

      {/* Anti-bot test */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium">Anti-Bot Detection Test</p>
            <p className="text-[11px] text-muted-foreground">
              Verify bypass against DataDome &amp; PerimeterX
              {hasProxy ? " via proxy" : ""}.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1.5"
            onClick={handleTestBotDetection}
            disabled={testingBot || saving}
          >
            {testingBot ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Bug className="size-3.5" />
            )}
            {testingBot ? "Testing…" : "Run Test"}
          </Button>
        </div>

        {botError && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <XCircle className="size-3.5 shrink-0" />
            {botError}
          </p>
        )}

        {botResults && (
          <div className="divide-y divide-border rounded-lg border bg-muted/30">
            {botResults.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-xs font-medium">
                    {r.protection}
                  </span>
                  {!!r.statusCode && r.statusCode > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {r.statusCode}
                    </span>
                  )}
                  {r.error && (!r.statusCode || r.statusCode === 0) && (
                    <span
                      className="truncate font-mono text-[10px] text-muted-foreground"
                      title={r.error}
                    >
                      {r.error}
                    </span>
                  )}
                </div>
                <BotResultBadge result={r} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
