"use client";

import { Globe, XCircle } from "lucide-react";

import { CompatibilityResultBadge } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsProxyBadges";
import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import {
  type CompatibilityResult,
  formatElapsed,
  previewText,
} from "@/app/dashboard/dashboard-services";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Describes the props for the compatibility error row component.
 */
interface CompatibilityErrorRowProps {
  compatibilityError: string;
}

/**
 * Describes the props for the compatibility panel body component.
 */
interface CompatibilityPanelBodyProps {
  compatibilityError: null | string;
  compatibilityResults: CompatibilityResult[] | null;
  resultsRef: React.RefObject<HTMLDivElement | null>;
  showLoadingSkeleton: boolean;
}
/**
 * Describes the props for the compatibility panel header component.
 */
interface CompatibilityPanelHeaderProps {
  compatibilityCheckedAt: null | number;
  hasProxy: boolean;
  isRunningCompatibilityCheck: boolean;
  nowTs: number;
  onRunCompatibilityCheck: () => Promise<void>;
  saving: boolean;
  showLoadingSkeleton: boolean;
}

/**
 * Describes the props for the compatibility results list component.
 */
interface CompatibilityResultsListProps {
  compatibilityResults: CompatibilityResult[];
  resultsRef: React.RefObject<HTMLDivElement | null>;
}
/**
 * Describes the props for the compatibility run button component.
 */
interface CompatibilityRunButtonProps {
  isRunningCompatibilityCheck: boolean;
  onRunCompatibilityCheck: () => Promise<void>;
  saving: boolean;
}

/**
 * Describes the props for the settings proxy compatibility panel component.
 */
interface SettingsProxyCompatibilityPanelProps {
  compatibilityCheckedAt: null | number;
  compatibilityError: null | string;
  compatibilityResults: CompatibilityResult[] | null;
  hasProxy: boolean;
  isLoading?: boolean;
  isRunningCompatibilityCheck: boolean;
  nowTs: number;
  onRunCompatibilityCheck: () => Promise<void>;
  resultsRef: React.RefObject<HTMLDivElement | null>;
  saving: boolean;
}
/**
 * Render the settings proxy compatibility panel component.
 * @param props - The component props.
 * @returns The rendered settings proxy compatibility panel component.
 */
export function SettingsProxyCompatibilityPanel(
  props: SettingsProxyCompatibilityPanelProps,
) {
  const {
    compatibilityCheckedAt,
    compatibilityError,
    compatibilityResults,
    hasProxy,
    isLoading = false,
    isRunningCompatibilityCheck,
    nowTs,
    onRunCompatibilityCheck,
    resultsRef,
    saving,
  } = props;
  const showLoadingSkeleton =
    isLoading &&
    !hasProxy &&
    compatibilityCheckedAt === null &&
    compatibilityError === null &&
    compatibilityResults === null;

  return (
    <div className="space-y-3">
      <CompatibilityPanelHeader
        compatibilityCheckedAt={compatibilityCheckedAt}
        hasProxy={hasProxy}
        isRunningCompatibilityCheck={isRunningCompatibilityCheck}
        nowTs={nowTs}
        onRunCompatibilityCheck={onRunCompatibilityCheck}
        saving={saving}
        showLoadingSkeleton={showLoadingSkeleton}
      />
      <CompatibilityPanelBody
        compatibilityError={compatibilityError}
        compatibilityResults={compatibilityResults}
        resultsRef={resultsRef}
        showLoadingSkeleton={showLoadingSkeleton}
      />
    </div>
  );
}

/**
 * Render the compatibility error row component.
 * @param props - The component props.
 * @returns The rendered compatibility error row component.
 */
function CompatibilityErrorRow(props: CompatibilityErrorRowProps) {
  const { compatibilityError } = props;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
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
  );
}
/**
 * Render the compatibility panel body component.
 * @param props - The component props.
 * @returns The rendered compatibility panel body component.
 */
function CompatibilityPanelBody(props: CompatibilityPanelBodyProps) {
  const {
    compatibilityError,
    compatibilityResults,
    resultsRef,
    showLoadingSkeleton,
  } = props;
  if (showLoadingSkeleton) {
    return null;
  }

  return (
    <>
      {compatibilityError && (
        <CompatibilityErrorRow compatibilityError={compatibilityError} />
      )}
      {compatibilityResults && (
        <CompatibilityResultsList
          compatibilityResults={compatibilityResults}
          resultsRef={resultsRef}
        />
      )}
    </>
  );
}

/**
 * Render the compatibility panel header component.
 * @param props - The component props.
 * @returns The rendered compatibility panel header component.
 */
function CompatibilityPanelHeader(props: CompatibilityPanelHeaderProps) {
  const {
    compatibilityCheckedAt,
    hasProxy,
    isRunningCompatibilityCheck,
    nowTs,
    onRunCompatibilityCheck,
    saving,
    showLoadingSkeleton,
  } = props;
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-medium">Compatibility Check</p>
        <p className="text-[11px] text-muted-foreground">
          Compare how a few common source environments respond from this app
          {hasProxy ? " via proxy" : ""}.
        </p>
        {!showLoadingSkeleton && compatibilityCheckedAt && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Last check {formatElapsed(compatibilityCheckedAt, nowTs)}
          </p>
        )}
      </div>
      {showLoadingSkeleton ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <CompatibilityRunButton
          isRunningCompatibilityCheck={isRunningCompatibilityCheck}
          onRunCompatibilityCheck={onRunCompatibilityCheck}
          saving={saving}
        />
      )}
    </div>
  );
}
/**
 * Render the compatibility results list component.
 * @param props - The component props.
 * @returns The rendered compatibility results list component.
 */
function CompatibilityResultsList(props: CompatibilityResultsListProps) {
  const { compatibilityResults, resultsRef } = props;
  return (
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
            {result.error &&
              (!result.statusCode || result.statusCode === 0) && (
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
  );
}

/**
 * Render the compatibility run button component.
 * @param props - The component props.
 * @returns The rendered compatibility run button component.
 */
function CompatibilityRunButton(props: CompatibilityRunButtonProps) {
  const { isRunningCompatibilityCheck, onRunCompatibilityCheck, saving } =
    props;
  return (
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
  );
}
