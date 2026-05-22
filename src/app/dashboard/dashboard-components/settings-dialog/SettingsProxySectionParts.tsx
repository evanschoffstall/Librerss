import { Globe, Save, Trash2, XCircle } from "lucide-react";

import {
  ProxyRoutingBadge,
  StatusBadge,
} from "@/app/dashboard/dashboard-components/settings-dialog/SettingsProxyBadges";
import { SettingsProxyCompatibilityPanel } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsProxyCompatibilityPanel";
import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import { previewText } from "@/app/dashboard/dashboard-services";
import { type UseSettingsProxyStateResult } from "@/app/dashboard/settings-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Describes the props for the proxy credentials section component.
 */
type ProxyCredentialsSectionProps = Pick<
  UseSettingsProxyStateResult,
  | "hasProxyPassword"
  | "proxyPassword"
  | "proxyUsername"
  | "saving"
  | "setProxyPassword"
  | "setProxyUsername"
> & {
  showPasswordField: boolean;
  showUsernameField: boolean;
};

/**
 * Describes the props for the proxy section header component.
 */
type ProxySectionHeaderProps = Pick<
  UseSettingsProxyStateResult,
  "proxyRoutingCheck"
> & {
  badgeStatus: Exclude<
    UseSettingsProxyStateResult["proxyStatus"],
    "loading"
  > | null;
  showStatusBadges: boolean;
  showStatusSkeletons: boolean;
};

/**
 * Describes the props for the proxy URL section component.
 */
type ProxyUrlSectionProps = Pick<
  UseSettingsProxyStateResult,
  | "error"
  | "handleClear"
  | "handleSave"
  | "hasProxy"
  | "inputRef"
  | "proxyUrl"
  | "saving"
  | "setError"
  | "setProxyUrl"
> & {
  isSaveDisabled: boolean;
  showProxyUrlRow: boolean;
};

/**
 * Describes the props for the settings proxy section body component.
 */
interface SettingsProxySectionBodyProps {
  proxyState: UseSettingsProxyStateResult;
}

/**
 * Render the proxy credentials section component.
 * @param props - The component props.
 * @returns The rendered proxy credentials section component.
 */
export function ProxyCredentialsSection(props: ProxyCredentialsSectionProps) {
  const {
    hasProxyPassword,
    proxyPassword,
    proxyUsername,
    saving,
    setProxyPassword,
    setProxyUsername,
    showPasswordField,
    showUsernameField,
  } = props;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label
          className="text-xs text-muted-foreground"
          htmlFor="proxy-username"
        >
          Username
        </Label>
        {!showUsernameField ? (
          <Skeleton className="h-9 w-full" />
        ) : (
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
        )}
      </div>
      <div className="space-y-1.5">
        <Label
          className="text-xs text-muted-foreground"
          htmlFor="proxy-password"
        >
          Password
          {hasProxyPassword && !proxyPassword ? (
            <span className="text-muted-foreground/60"> · saved</span>
          ) : null}
        </Label>
        {!showPasswordField ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Input
            autoComplete="current-password"
            className="h-9 font-mono text-sm"
            disabled={saving}
            id="proxy-password"
            onChange={(e) => {
              setProxyPassword(e.target.value);
            }}
            placeholder={hasProxyPassword ? "leave blank to keep" : "optional"}
            type="password"
            value={proxyPassword}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Render the proxy section header component.
 * @param props - The component props.
 * @returns The rendered proxy section header component.
 */
export function ProxySectionHeader(props: ProxySectionHeaderProps) {
  const {
    badgeStatus,
    proxyRoutingCheck,
    showStatusBadges,
    showStatusSkeletons,
  } = props;
  return (
    <div
      className="
        flex flex-col gap-3
        sm:flex-row sm:items-start sm:justify-between sm:gap-4
      "
    >
      <div className="min-w-0 flex-1">
        <h3 className="section-heading">
          <Globe className="icon-muted" />
          Connection Routing
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Route article requests through your own proxy when a source is more
          reliable from a different network path.
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
        {showStatusBadges ? (
          <>
            <StatusBadge
              routingCheck={proxyRoutingCheck}
              status={badgeStatus ?? "none"}
            />
            <ProxyRoutingBadge
              routingCheck={proxyRoutingCheck}
              status={badgeStatus ?? "none"}
            />
          </>
        ) : showStatusSkeletons ? (
          <ProxyBadgeSkeletons />
        ) : (
          <></>
        )}
      </div>
    </div>
  );
}

/**
 * Render the proxy url section component.
 * @param props - The component props.
 * @returns The rendered proxy url section component.
 */
export function ProxyUrlSection(props: ProxyUrlSectionProps) {
  const {
    error,
    handleClear,
    handleSave,
    hasProxy,
    inputRef,
    isSaveDisabled,
    proxyUrl,
    saving,
    setError,
    setProxyUrl,
    showProxyUrlRow,
  } = props;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Proxy URL</Label>
      {!showProxyUrlRow ? (
        <ProxyUrlRowSkeleton />
      ) : (
        <>
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
              disabled={isSaveDisabled}
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
            {hasProxy ? (
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
            ) : null}
          </div>
          {error ? <ProxyErrorMessage error={error} /> : null}
        </>
      )}
    </div>
  );
}

/**
 * Render the settings proxy section body component.
 * @param props - The component props.
 * @returns The rendered settings proxy section body component.
 */
export function SettingsProxySectionBody(props: SettingsProxySectionBodyProps) {
  const { proxyState } = props;
  const {
    compatibilityCheckedAt,
    compatibilityError,
    compatibilityResults,
    handleRunCompatibilityCheck,
    hasProxy,
    isInitialProxyLoadPending,
    isRunningCompatibilityCheck,
    nowTs,
    resultsRef,
    saving,
  } = proxyState;
  const isLoading = isInitialProxyLoadPending;

  return (
    <SettingsProxyCompatibilityPanel
      compatibilityCheckedAt={compatibilityCheckedAt}
      compatibilityError={compatibilityError}
      compatibilityResults={compatibilityResults}
      hasProxy={hasProxy}
      isLoading={isLoading}
      isRunningCompatibilityCheck={isRunningCompatibilityCheck}
      nowTs={nowTs}
      onRunCompatibilityCheck={handleRunCompatibilityCheck}
      resultsRef={resultsRef}
      saving={saving}
    />
  );
}

/**
 * Render the proxy badge skeletons component.
 * @returns The rendered proxy badge skeletons component.
 */
function ProxyBadgeSkeletons() {
  return (
    <div
      className="
        flex flex-row flex-wrap gap-1.5
        sm:flex-col sm:items-end
      "
    >
      <Skeleton className="h-5 w-20 rounded-full" />
      <Skeleton className="h-5 w-28 rounded-full" />
    </div>
  );
}

/**
 * Render the proxy error message component.
 * @param props - The component props.
 * @returns The rendered proxy error message component.
 */
function ProxyErrorMessage(props: Pick<UseSettingsProxyStateResult, "error">) {
  const { error } = props;
  if (!error) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
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
  );
}

/**
 * Render the proxy url row skeleton component.
 * @returns The rendered proxy url row skeleton component.
 */
function ProxyUrlRowSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-9 flex-1" />
      <Skeleton className="h-9 w-20" />
      <Skeleton className="size-9" />
    </div>
  );
}
