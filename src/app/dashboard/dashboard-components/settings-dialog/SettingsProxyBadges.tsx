"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import {
  type CompatibilityResult,
  previewText,
  type ProxyRoutingCheck,
  type ProxyUIStatus,
} from "@/app/dashboard/dashboard-services";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * @param root0
 * @param root0.result
 */
export function CompatibilityResultBadge({
  result,
}: {
  result: CompatibilityResult;
}) {
  const base = "h-5 shrink-0 px-1.5 text-[10px]";
  if (result.success && !result.compatibilitySignalDetected) {
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
  if (
    result.compatibilitySignalDetected &&
    result.statusCode &&
    result.statusCode > 0
  ) {
    return (
      <Badge
        className={`
          ${base}
          border-yellow-400/40 bg-yellow-50 text-yellow-600
          dark:bg-yellow-950/30 dark:text-yellow-400
        `}
        variant="outline"
      >
        Limited
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

/**
 * @param root0
 * @param root0.routingCheck
 * @param root0.status
 */
export function ProxyRoutingBadge({
  routingCheck,
  status,
}: {
  routingCheck?: null | ProxyRoutingCheck;
  status?: Exclude<ProxyUIStatus, "loading">;
}) {
  if (status === "none") {
    return null;
  }

  if (status === "checking") {
    return (
      <Badge
        className={`
          h-5 shrink-0 gap-1 border-yellow-400/40 bg-yellow-50 px-1.5
          text-[10px] font-medium whitespace-nowrap text-yellow-600
          dark:bg-yellow-950/30 dark:text-yellow-400
        `}
        variant="outline"
      >
        <MotionSpinner iconClassName="size-2.5" />
        Checking
      </Badge>
    );
  }

  if (!routingCheck) {
    return null;
  }

  const badgeConfig = resolveProxyRoutingBadgeConfig(routingCheck);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className={`
            h-5 shrink-0 gap-1 px-1.5 text-[10px] font-medium whitespace-nowrap
            ${badgeConfig.className}
          `}
          variant="outline"
        >
          {badgeConfig.icon === "check" && (
            <CheckCircle2 className="size-2.5" />
          )}
          {badgeConfig.icon === "error" && <XCircle className="size-2.5" />}
          {badgeConfig.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-xs" side="left">
        <p>{describeRoutingCheck(routingCheck)}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * @param root0
 * @param root0.routingCheck
 * @param root0.status
 */
export function StatusBadge({
  routingCheck,
  status,
}: {
  routingCheck?: null | ProxyRoutingCheck;
  status: Exclude<ProxyUIStatus, "loading">;
}) {
  if (status === "none") return null;
  const cfg = resolveStatusBadgeConfig(status, routingCheck);
  return (
    <Badge
      className={`
        h-5 shrink-0 gap-1 px-1.5 text-[10px] font-medium whitespace-nowrap
        ${cfg.cls}
      `}
      variant="outline"
    >
      {cfg.icon === "spinner" && <MotionSpinner iconClassName="size-2.5" />}
      {cfg.icon === "check" && <CheckCircle2 className="size-2.5" />}
      {cfg.icon === "error" && <XCircle className="size-2.5" />}
      {cfg.label}
    </Badge>
  );
}

/**
 * @param routingCheck
 */
function describeRoutingCheck(routingCheck: ProxyRoutingCheck): string {
  const directExit = routingCheck.directIp ?? "unknown";
  const proxyExit = routingCheck.proxyExitIp ?? "unknown";

  const statusDescriptions = {
    error: routingCheck.error ?? "The proxy exit IP could not be determined.",
    "proxy-only": `Proxy exit ${proxyExit}. Direct comparison failed: ${routingCheck.error ?? "unknown error"}.`,
    "same-egress": `Direct exit ${directExit}; proxy exit ${proxyExit}. This check did not detect a different proxy egress IP.`,
    verified: `Direct exit ${directExit}; proxy exit ${proxyExit}. Upstream requests are leaving through the proxy.`,
  } satisfies Record<ProxyRoutingCheck["status"], string>;

  return statusDescriptions[routingCheck.status];
}

/**
 * @param routingCheck
 */
function resolveProxyRoutingBadgeConfig(routingCheck: ProxyRoutingCheck) {
  const exitIpLabel = routingCheck.proxyExitIp
    ? `Exit ${previewText(routingCheck.proxyExitIp, 18)}`
    : null;

  return {
    error: {
      className: "text-destructive border-destructive/30 bg-destructive/5",
      icon: "error",
      label: "Exit IP Unknown",
    },
    "proxy-only": {
      className:
        "text-yellow-600 border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400",
      icon: "check",
      label: exitIpLabel ?? "Exit Captured",
    },
    "same-egress": {
      className:
        "text-yellow-600 border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400",
      icon: "error",
      label: "Same Exit IP",
    },
    verified: {
      className:
        "text-green-600 border-green-400/40 bg-green-50 dark:bg-green-950/30 dark:text-green-400",
      icon: "check",
      label: exitIpLabel ?? "Route Verified",
    },
  }[routingCheck.status];
}

/**
 * @param status
 * @param routingCheck
 */
function resolveStatusBadgeConfig(
  status: Exclude<ProxyUIStatus, "loading">,
  routingCheck?: null | ProxyRoutingCheck,
) {
  switch (status) {
    case "checking": {
      return {
        cls: "text-yellow-600 border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400",
        icon: "spinner",
        label: "Checking",
      } as const;
    }

    case "none": {
      return {
        cls: "",
        icon: "error",
        label: "",
      } as const;
    }

    case "reachable": {
      if (routingCheck?.status === "error") {
        return {
          cls: "text-destructive border-destructive/30 bg-destructive/5",
          icon: "error",
          label: "Route Failed",
        } as const;
      }

      if (routingCheck?.status === "same-egress") {
        return {
          cls: "text-yellow-600 border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400",
          icon: "error",
          label: "No Route Change",
        } as const;
      }

      return {
        cls: "text-green-600 border-green-400/40 bg-green-50 dark:bg-green-950/30 dark:text-green-400",
        icon: "check",
        label: "Connected",
      } as const;
    }

    case "unreachable": {
      return {
        cls: "text-destructive border-destructive/30 bg-destructive/5",
        icon: "error",
        label: "Unreachable",
      } as const;
    }
  }
}
