"use client";

import {
    Globe,
    Info,
    Save,
    Trash2,
    XCircle
} from "lucide-react";
  
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
    TooltipTrigger
} from "@/components/ui/tooltip";

import {
  useSettingsProxyState,
  type UseSettingsProxyStateResult,
} from "../../hooks/useSettingsProxyState";
import { previewText } from "../../services/settings-proxy";
import { MotionSpinner } from "../MotionSpinner";
import {
  ProxyRoutingBadge,
  StatusBadge,
} from "./SettingsProxyBadges";
import { SettingsProxyCompatibilityPanel } from "./SettingsProxyCompatibilityPanel";

export function SettingsProxySection() {
  const proxyState = useSettingsProxyState();

  return <SettingsProxySectionContent {...proxyState} />;
}

/** Renders the proxy settings surface from an already-owned proxy state model. */
export function SettingsProxySectionContent({
  allowInsecureTls,
  compatibilityCheckedAt,
  compatibilityError,
  compatibilityResults,
  error,
  handleClear,
  handleRunCompatibilityCheck,
  handleSave,
  hasProxy,
  hasProxyPassword,
  inputRef,
  isRunningCompatibilityCheck,
  nowTs,
  proxyPassword,
  proxyRoutingCheck,
  proxyStatus,
  proxyUrl,
  proxyUsername,
  resultsRef,
  saving,
  setError,
  setProxyPassword,
  setProxyUrl,
  setProxyUsername,
  syncAllowInsecureTls,
}: UseSettingsProxyStateResult) {

  if (proxyStatus === "loading") return <ProxySkeleton />;

  return (
    <TooltipProvider delayDuration={250}>
      <section className="settings-card">
        {/* Header */}
        <div className="
          flex flex-col gap-3
          sm:flex-row sm:items-start sm:justify-between sm:gap-4
        ">
          <div className="min-w-0 flex-1">
            <h3 className="section-heading">
              <Globe className="icon-muted" />
              Connection Routing
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Route article requests through your own proxy when a source is
              more reliable from a different network path.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Optional proxy usernames are stored with your settings. Proxy
              passwords are encrypted before they are written to storage.
            </p>
          </div>
          <div
            className="
              flex flex-row flex-wrap items-start gap-1.5
              sm:flex-col sm:items-end
            "
          >
            <StatusBadge
              routingCheck={proxyRoutingCheck}
              status={proxyStatus}
            />
            <ProxyRoutingBadge
              routingCheck={proxyRoutingCheck}
              status={proxyStatus}
            />
          </div>
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
              void syncAllowInsecureTls(checked);
            }}
          />
        </div>

        <Separator />

        <SettingsProxyCompatibilityPanel
          compatibilityCheckedAt={compatibilityCheckedAt}
          compatibilityError={compatibilityError}
          compatibilityResults={compatibilityResults}
          hasProxy={hasProxy}
          isRunningCompatibilityCheck={isRunningCompatibilityCheck}
          nowTs={nowTs}
          onRunCompatibilityCheck={handleRunCompatibilityCheck}
          resultsRef={resultsRef}
          saving={saving}
        />
      </section>
    </TooltipProvider>
  );
}

function ProxySkeleton() {
  return (
    <section className="settings-card">
      <div className="
        flex flex-col gap-3
        sm:flex-row sm:items-start sm:justify-between sm:gap-4
      ">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-3 w-72" />
        </div>
        <div className="
          flex flex-row flex-wrap gap-1.5
          sm:flex-col sm:items-end
        ">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
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

