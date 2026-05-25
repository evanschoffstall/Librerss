"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DashboardEffectsOptions } from "@/app/dashboard/hooks/dashboard-controller/dashboardControllerComposition";

import { useDashboardIntervals } from "@/app/dashboard/hooks";
import { DASHBOARD_EVENTS } from "@/app/dashboard/services/dashboard-constants";

/** Controls returned to the auto-refresh hook for starting and finishing runs. */
interface AutoRefreshRunControls {
  beginRun: () => null | number;
  finishRun: (runId: number) => void;
}

/** Mutable ownership inputs for one auto-refresh run controller. */
interface AutoRefreshRunControlsOptions {
  setIsAutoRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  timeoutMs: number;
}

/** Dashboard inputs needed to run and time-box background auto-refresh. */
interface DashboardAutoRefreshOptions {
  autoRefreshFeedList: () => Promise<void>;
  autoRefreshIntervalMinutes: number;
  /** Maximum wall-clock duration before a background auto-refresh releases its UI latch. */
  autoRefreshTimeoutMs: number;
  cancelPendingArticleStatusMutations?: () => void;
  cancelPendingRequest: DashboardEffectsOptions["onTimeout"];
  setRelativeRefreshTick: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Manages dashboard auto-refresh state, timeout ownership, and stale completion
 * protection for background refreshes that can be interrupted by browser sleep.
 *
 * @param options - Auto-refresh callbacks, cadence, timeout, and cleanup hooks.
 * @returns Whether an auto-refresh currently owns the dashboard pending state.
 */
export function useDashboardAutoRefresh(options: DashboardAutoRefreshOptions) {
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const runControls = useAutoRefreshRunControls({
    setIsAutoRefreshing,
    timeoutMs: options.autoRefreshTimeoutMs,
  });

  /**
   * Runs one background auto-refresh under single-flight and timeout ownership
   * so suspended browser connections cannot keep the dashboard locked.
   */
  const wrappedAutoRefreshFeedList = useCallback(async () => {
    const runId = runControls.beginRun();

    if (runId === null) {
      return;
    }

    try {
      await options.autoRefreshFeedList();
    } finally {
      runControls.finishRun(runId);
    }
  }, [options, runControls]);

  /** Cancels stale foreground work before a resume-triggered refresh starts. */
  const handleStaleTabResume = useCallback(() => {
    options.cancelPendingArticleStatusMutations?.();
    options.cancelPendingRequest?.();
  }, [options]);

  useDashboardIntervals({
    autoRefreshFeedList: wrappedAutoRefreshFeedList,
    autoRefreshIntervalMinutes: options.autoRefreshIntervalMinutes,
    onStaleTabResume: handleStaleTabResume,
    setRelativeRefreshTick: options.setRelativeRefreshTick,
  });

  return isAutoRefreshing;
}

/**
 * Clears an owned auto-refresh timeout ref.
 *
 * @param timeoutRef - Mutable ref containing the active timeout id, if present.
 */
function clearAutoRefreshTimeout(
  timeoutRef: React.RefObject<null | ReturnType<typeof setTimeout>>,
) {
  if (timeoutRef.current === null) {
    return;
  }

  clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
}

/**
 * Owns the mutable run id and timeout state for auto-refresh single-flight
 * behavior.
 *
 * @param options - State setter, timeout duration, and cancellation callback.
 * @returns Run lifecycle callbacks for the auto-refresh wrapper.
 */
function useAutoRefreshRunControls(
  options: AutoRefreshRunControlsOptions,
): AutoRefreshRunControls {
  const activeRunIdRef = useRef<null | number>(null);
  const nextRunIdRef = useRef(0);
  const timeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  /**
   * Completes a run only when it still owns the active auto-refresh latch.
   *
   * @param runId - Monotonic identifier assigned when the run started.
   */
  const finishRun = useCallback(
    (runId: number) => {
      if (activeRunIdRef.current !== runId) {
        return;
      }

      activeRunIdRef.current = null;
      clearAutoRefreshTimeout(timeoutRef);
      options.setIsAutoRefreshing(false);
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_END));
    },
    [options],
  );

  /**
   * Releases pending UI state after the timeout without cancelling the refresh.
   * The network request may have reached the server before the browser paused;
   * leaving it alive lets a late response still hydrate newly fetched articles.
   *
   * @param runId - Monotonic identifier assigned when the run started.
   */
  const releaseTimedOutRun = useCallback(
    (runId: number) => {
      if (activeRunIdRef.current !== runId) {
        return;
      }

      finishRun(runId);
    },
    [finishRun],
  );

  /**
   * Starts a new run when no previous auto-refresh is still active.
   *
   * @returns The new run id, or null when an active run already exists.
   */
  const beginRun = useCallback(() => {
    if (activeRunIdRef.current !== null) {
      return null;
    }

    nextRunIdRef.current += 1;
    const runId = nextRunIdRef.current;
    activeRunIdRef.current = runId;
    options.setIsAutoRefreshing(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_START));
    timeoutRef.current = setTimeout(() => {
      releaseTimedOutRun(runId);
    }, options.timeoutMs);

    return runId;
  }, [options, releaseTimedOutRun]);

  useEffect(
    () => () => {
      activeRunIdRef.current = null;
      clearAutoRefreshTimeout(timeoutRef);
    },
    [],
  );

  return { beginRun, finishRun };
}
