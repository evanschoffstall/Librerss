"use client";

import {
    CheckCircle2,
    Globe,
    Info,
    Save,
    Trash2,
    XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

interface BotResult {
  blocked: boolean;
  error?: string;
  protection: string;
  statusCode?: number;
  success: boolean;
}

interface BotResultsCache {
  checkedAt: number;
  results: BotResult[];
}

type ProxyUIStatus =
  | "checking"
  | "loading"
  | "none"
  | "reachable"
  | "unreachable";

const ERROR_PREVIEW_CHARS = 88;
const BOT_RESULTS_CACHE_KEY = "librerss:settings:proxy:bot-results:v1";

export function SettingsProxySection() {
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyStatus, setProxyStatus] = useState<ProxyUIStatus>("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [allowInsecureTls, setAllowInsecureTls] = useState(false);
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");
  const [hasProxyPassword, setHasProxyPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [testingBot, setTestingBot] = useState(false);
  const [botResults, setBotResults] = useState<BotResult[] | null>(null);
  const [botError, setBotError] = useState<null | string>(null);
  const [botCheckedAt, setBotCheckedAt] = useState<null | number>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const resultsRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollToResultsRef = useRef(false);

  useEffect(() => {
    ArticleService.getProxySettings()
      .then((result) => {
        setProxyUrl(result.proxyUrl ?? "");
        setAllowInsecureTls(result.allowInsecureTls);
        setProxyUsername(result.proxyUsername ?? "");
        setHasProxyPassword(result.hasProxyPassword);
        setProxyStatus(result.proxyUrl === null ? "none" : result.status);
        if (result.error) setError(result.error);
      })
      .catch(() => {
        setProxyStatus("none");
      });
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BOT_RESULTS_CACHE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isBotResultsCache(parsed)) return;
      if (
        typeof parsed.checkedAt !== "number" ||
        !Array.isArray(parsed.results)
      )
        return;
      setBotResults(parsed.results);
      setBotCheckedAt(parsed.checkedAt);
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!botResults || !shouldAutoScrollToResultsRef.current) return;
    shouldAutoScrollToResultsRef.current = false;
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });
  }, [botResults]);

  if (proxyStatus === "loading") return <ProxySkeleton />;

  const hasProxy =
    proxyStatus === "reachable" ||
    proxyStatus === "unreachable" ||
    proxyStatus === "checking";

  const clearBotDetectionResults = () => {
    setBotResults(null);
    setBotCheckedAt(null);
    setBotError(null);
    shouldAutoScrollToResultsRef.current = false;
    try {
      window.localStorage.removeItem(BOT_RESULTS_CACHE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const handleSave = async () => {
    const trimmed = proxyUrl.trim();
    if (!trimmed) return;
    clearBotDetectionResults();
    setSaving(true);
    setError(null);
    setProxyStatus("checking");
    try {
      const result = await ArticleService.saveProxyUrl(trimmed, {
        allowInsecureTls,
        proxyPassword: proxyPassword || null,
        proxyUsername: proxyUsername.trim() || null,
      });
      setProxyUrl(result.proxyUrl ?? "");
      setProxyUsername(result.proxyUsername ?? "");
      setHasProxyPassword(result.hasProxyPassword);
      if (proxyPassword) setProxyPassword("");
      if (result.error) {
        setError(result.error);
        setProxyStatus("unreachable");
      } else if (!result.proxyUrl) {
        setProxyStatus("none");
      } else {
        setProxyStatus(result.status);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save proxy URL");
      setProxyStatus("unreachable");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    clearBotDetectionResults();
    setSaving(true);
    setError(null);
    try {
      await ArticleService.saveProxyUrl(null, {
        proxyPassword: null,
        proxyUsername: null,
      });
      setProxyUrl("");
      setProxyUsername("");
      setProxyPassword("");
      setHasProxyPassword(false);
      setProxyStatus("none");
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
    setBotError(null);
    setError(null);
    try {
      const response = await ArticleService.testBotDetection({
        useProxy: hasProxy,
      });
      shouldAutoScrollToResultsRef.current = true;
      setBotResults(response.results);
      const checkedAt = Date.now();
      setBotCheckedAt(checkedAt);
      window.localStorage.setItem(
        BOT_RESULTS_CACHE_KEY,
        JSON.stringify({
          checkedAt,
          results: response.results,
        } satisfies BotResultsCache),
      );
    } catch (err) {
      setBotError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestingBot(false);
    }
  };

  return (
    <TooltipProvider delayDuration={250}>
      <section className="settings-card">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="section-heading">
              <Globe className="icon-muted" />
              Extraction Proxy
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Route article extraction through a proxy to bypass
              geo-restrictions or bot detection.
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
              className="h-9 font-mono text-sm"
              disabled={saving}
              onChange={(e) => {
                setProxyUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleSave();
                }
              }}
              placeholder="http://proxy:8080  ·  socks5://proxy:1080  ·  1.2.3.4:8080"
              ref={inputRef}
              type="text"
              value={proxyUrl}
            />
            <Button
              className="h-9 shrink-0 gap-1.5"
              disabled={saving || !proxyUrl.trim()}
              onClick={() => {
                void handleSave();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {saving ? (
                <MotionSpinner iconClassName="size-3.5" />
              ) : (
                <Save className="size-3.5" />
              )}
              Save
            </Button>
            {hasProxy && (
              <Button
                className="
                  h-9 shrink-0 px-2 text-muted-foreground
                  hover:text-destructive
                "
                disabled={saving}
                onClick={() => {
                  void handleClear();
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
          {error && (
            <div
              className="
                flex min-w-0 items-center gap-1.5 text-xs text-destructive
              "
            >
              <XCircle className="size-3.5 shrink-0" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="max-w-md min-w-0 truncate">
                    {previewText(error)}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-160 text-xs" side="top">
                  <p className="break-all">{error}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Credentials */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label
              className="text-xs text-muted-foreground"
              htmlFor="proxy-username"
            >
              Username
            </Label>
            <Input
              autoComplete="username"
              className="h-9 font-mono text-sm"
              disabled={saving}
              id="proxy-username"
              onChange={(e) => {
                setProxyUsername(e.target.value);
              }}
              placeholder="optional"
              type="text"
              value={proxyUsername}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              className="text-xs text-muted-foreground"
              htmlFor="proxy-password"
            >
              Password
              {hasProxyPassword && !proxyPassword && (
                <span className="text-muted-foreground/60"> · saved</span>
              )}
            </Label>
            <Input
              autoComplete="current-password"
              className="h-9 font-mono text-sm"
              disabled={saving}
              id="proxy-password"
              onChange={(e) => {
                setProxyPassword(e.target.value);
              }}
              placeholder={
                hasProxyPassword ? "leave blank to keep" : "optional"
              }
              type="password"
              value={proxyPassword}
            />
          </div>
        </div>

        <Separator />

        {/* TLS toggle */}
        <div className="row-between">
          <div className="flex items-center gap-1.5">
            <Label
              className="cursor-pointer text-xs"
              htmlFor="allow-insecure-tls"
            >
              Allow insecure TLS
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-44 text-xs" side="right">
                Skips certificate validation. Use only for trusted private
                proxies.
              </TooltipContent>
            </Tooltip>
          </div>
          <Switch
            checked={allowInsecureTls}
            disabled={saving}
            id="allow-insecure-tls"
            onCheckedChange={(checked) => {
              const currentUrl = proxyUrl.trim();
              if (!currentUrl) return;
              setAllowInsecureTls(checked);
              void (async () => {
                try {
                  await ArticleService.saveProxyUrl(currentUrl, {
                    allowInsecureTls: checked,
                  });
                } catch {
                  setAllowInsecureTls(!checked);
                }
              })();
            }}
          />
        </div>

        <Separator />

        {/* Anti-bot test */}
        <div className="space-y-3">
          <div className="row-between">
            <div>
              <p className="text-xs font-medium">Anti-Bot Detection Test</p>
              <p className="text-[11px] text-muted-foreground">
                Verify bypass against DataDome, PerimeterX, Cloudflare, and
                reCAPTCHA
                {hasProxy ? " via proxy" : ""}.
              </p>
              {botCheckedAt && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Last check {formatElapsed(botCheckedAt, nowTs)}
                </p>
              )}
            </div>
            <Button
              className="h-8 shrink-0 gap-1.5"
              disabled={testingBot || saving}
              onClick={() => {
                void handleTestBotDetection();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {testingBot ? (
                <MotionSpinner iconClassName="size-3.5" />
              ) : (
                <Bug className="size-3.5" />
              )}
              {testingBot ? "Testing…" : "Run Test"}
            </Button>
          </div>

          {botError && (
            <div
              className="
                flex min-w-0 items-center gap-1.5 text-xs text-destructive
              "
            >
              <XCircle className="size-3.5 shrink-0" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="max-w-md min-w-0 truncate">
                    {previewText(botError)}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-160 text-xs" side="top">
                  <p className="break-all">{botError}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {botResults && (
            <div
              className="divide-y divide-border rounded-lg border bg-muted/30"
              ref={resultsRef}
            >
              {botResults.map((r, i) => (
                <div
                  className="flex items-center justify-between gap-3 px-3 py-2"
                  key={i}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 text-xs font-medium">
                      {r.protection}
                    </span>
                    {!!r.statusCode && r.statusCode > 0 && (
                      <span className="
                        font-mono text-[10px] text-muted-foreground
                      ">
                        {r.statusCode}
                      </span>
                    )}
                    {r.error && (!r.statusCode || r.statusCode === 0) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="
                              max-w-[20rem] min-w-0 flex-1 truncate font-mono
                              text-[10px] text-muted-foreground
                              md:max-w-md
                            "
                          >
                            {previewText(r.error)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          className="max-w-160 text-xs"
                          side="top"
                        >
                          <p className="break-all">{r.error}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <BotResultBadge result={r} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </TooltipProvider>
  );
}

function BotResultBadge({ result }: { result: BotResult }) {
  const base = "h-5 shrink-0 px-1.5 text-[10px]";
  if (result.success && !result.blocked) {
    return (
      <Badge
        className={`
          ${base}
          border-green-400/40 bg-green-50 text-green-600
          dark:bg-green-950/30 dark:text-green-400
        `}
        variant="outline"
      >
        Passed
      </Badge>
    );
  }
  if (result.blocked && result.statusCode && result.statusCode > 0) {
    return (
      <Badge
        className={`
          ${base}
          border-yellow-400/40 bg-yellow-50 text-yellow-600
          dark:bg-yellow-950/30 dark:text-yellow-400
        `}
        variant="outline"
      >
        Blocked
      </Badge>
    );
  }
  return (
    <Badge
      className={`
        ${base}
        border-destructive/30 bg-destructive/5 text-destructive
      `}
      variant="outline"
    >
      {result.error ? "Connection Error" : "Failed"}
    </Badge>
  );
}

function formatElapsed(checkedAt: number, now: number) {
  const elapsedSec = Math.max(0, Math.floor((now - checkedAt) / 1000));
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 60) return `${elapsedMin}m ago`;
  const elapsedHr = Math.floor(elapsedMin / 60);
  if (elapsedHr < 24) return `${elapsedHr}h ago`;
  const elapsedDay = Math.floor(elapsedHr / 24);
  return `${elapsedDay}d ago`;
}

function isBotResultsCache(value: unknown): value is BotResultsCache {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "checkedAt" in value && "results" in value;
}

function previewText(text: string, maxChars = ERROR_PREVIEW_CHARS) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function ProxySkeleton() {
  return (
    <section className="settings-card">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Skeleton className="h-3 w-14" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="size-9" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>

      <Separator />

      <div className="row-between">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="size-3 rounded-full" />
        </div>
        <Skeleton className="h-5 w-9 rounded-full" />
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="row-between">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
    </section>
  );
}

function StatusBadge({
  status,
}: {
  status: Exclude<ProxyUIStatus, "loading">;
}) {
  if (status === "none") return null;
  const cfg = {
    checking: {
      cls: "text-yellow-600 border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400",
      label: "Checking",
    },
    reachable: {
      cls: "text-green-600 border-green-400/40 bg-green-50 dark:bg-green-950/30 dark:text-green-400",
      label: "Connected",
    },
    unreachable: {
      cls: "text-destructive border-destructive/30 bg-destructive/5",
      label: "Unreachable",
    },
  }[status];
  return (
    <Badge
      className={`
        h-5 gap-1 px-1.5 text-[10px] font-medium
        ${cfg.cls}
      `}
      variant="outline"
    >
      {status === "checking" && <MotionSpinner iconClassName="size-2.5" />}
      {status === "reachable" && <CheckCircle2 className="size-2.5" />}
      {status === "unreachable" && <XCircle className="size-2.5" />}
      {cfg.label}
    </Badge>
  );
}
