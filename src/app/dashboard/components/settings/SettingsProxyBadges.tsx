"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { type CompatibilityResult, type ProxyUIStatus } from "../../services/settings-proxy";
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

export function StatusBadge({
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