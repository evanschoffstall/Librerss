"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  type CompatibilityResult,
  previewText,
  type ProxyRoutingCheck,
  type ProxyUIStatus,
} from "../../services/settings-proxy";
import { MotionSpinner } from "../MotionSpinner";

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

  const badgeConfig = {
    error: {
      className: "text-destructive border-destructive/30 bg-destructive/5",
      icon: "error",
      label: "Exit IP Unknown",
    },
    "proxy-only": {
      className:
        "text-yellow-600 border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400",
      icon: "check",
      label: routingCheck.proxyExitIp
        ? `Exit ${previewText(routingCheck.proxyExitIp, 18)}`
        : "Exit Captured",
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
      label: routingCheck.proxyExitIp
        ? `Exit ${previewText(routingCheck.proxyExitIp, 18)}`
        : "Route Verified",
    },
  }[routingCheck.status];

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
          {badgeConfig.icon === "check" && <CheckCircle2 className="size-2.5" />}
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

function describeRoutingCheck(routingCheck: ProxyRoutingCheck): string {
  if (routingCheck.status === "verified") {
    return `Direct exit ${routingCheck.directIp ?? "unknown"}; proxy exit ${routingCheck.proxyExitIp ?? "unknown"}. Upstream requests are leaving through the proxy.`;
  }

  if (routingCheck.status === "same-egress") {
    return `Direct exit ${routingCheck.directIp ?? "unknown"}; proxy exit ${routingCheck.proxyExitIp ?? "unknown"}. This check did not detect a different proxy egress IP.`;
  }

  if (routingCheck.status === "proxy-only") {
    return `Proxy exit ${routingCheck.proxyExitIp ?? "unknown"}. Direct comparison failed: ${routingCheck.error ?? "unknown error"}.`;
  }

  return routingCheck.error ?? "The proxy exit IP could not be determined.";
}

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