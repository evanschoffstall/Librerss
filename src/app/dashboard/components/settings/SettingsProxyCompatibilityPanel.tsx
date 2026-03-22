"use client";

import { Globe, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  type CompatibilityResult,
  formatElapsed,
  previewText,
} from "../../services/settings-proxy";
import { MotionSpinner } from "../MotionSpinner";
import { CompatibilityResultBadge } from "./SettingsProxyBadges";

export function SettingsProxyCompatibilityPanel({
  compatibilityCheckedAt,
  compatibilityError,
  compatibilityResults,
  hasProxy,
  isRunningCompatibilityCheck,
  nowTs,
  onRunCompatibilityCheck,
  resultsRef,
  saving,
}: {
  compatibilityCheckedAt: null | number;
  compatibilityError: null | string;
  compatibilityResults: CompatibilityResult[] | null;
  hasProxy: boolean;
  isRunningCompatibilityCheck: boolean;
  nowTs: number;
  onRunCompatibilityCheck: () => Promise<void>;
  resultsRef: React.RefObject<HTMLDivElement | null>;
  saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="row-between">
        <div>
          <p className="text-xs font-medium">Compatibility Check</p>
          <p className="text-[11px] text-muted-foreground">
            Compare how a few common source environments respond from this app
            {hasProxy ? " via proxy" : ""}.
          </p>
          {compatibilityCheckedAt && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Last check {formatElapsed(compatibilityCheckedAt, nowTs)}
            </p>
          )}
        </div>
        <Button
          className="h-8 shrink-0 gap-1.5"
          disabled={isRunningCompatibilityCheck || saving}
          onClick={() => {
            void onRunCompatibilityCheck();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {isRunningCompatibilityCheck ? (
            <MotionSpinner iconClassName="size-3.5" />
          ) : (
            <Globe className="size-3.5" />
          )}
          {isRunningCompatibilityCheck ? "Checking…" : "Run Check"}
        </Button>
      </div>

      {compatibilityError && (
        <div
          className="flex min-w-0 items-center gap-1.5 text-xs text-destructive"
        >
          <XCircle className="size-3.5 shrink-0" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-md min-w-0 truncate">
                {previewText(compatibilityError)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-160 text-xs" side="top">
              <p className="break-all">{compatibilityError}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {compatibilityResults && (
        <div
          className="divide-y divide-border rounded-lg border bg-muted/30"
          ref={resultsRef}
        >
          {compatibilityResults.map((result, index) => (
            <div
              className="flex items-center justify-between gap-3 px-3 py-2"
              key={`${result.vendor}-${index}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-xs font-medium">
                  {result.vendor}
                </span>
                {!!result.statusCode && result.statusCode > 0 && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {result.statusCode}
                  </span>
                )}
                {result.error && (!result.statusCode || result.statusCode === 0) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="
                          max-w-[20rem] min-w-0 flex-1 truncate font-mono
                          text-[10px] text-muted-foreground
                          md:max-w-md
                        "
                      >
                        {previewText(result.error)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-160 text-xs" side="top">
                      <p className="break-all">{result.error}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <CompatibilityResultBadge result={result} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}