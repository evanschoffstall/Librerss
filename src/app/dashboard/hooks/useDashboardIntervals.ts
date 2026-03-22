"use client";

import type { Dispatch, SetStateAction } from "react";

import { useEffect, useEffectEvent, useRef } from "react";

import { toAutoRefreshIntervalMs } from "../services/refresh-policy";

/**
 * Brief delay before firing an auto-refresh after tab resume, giving the
 * browser time to restore DNS / TCP / TLS state that may have been torn
 * down while the tab was suspended.
 */
const TAB_RESUME_DELAY_MS = 1_500;

interface UseDashboardIntervalsOptions {
  autoRefreshFeedList: () => void;
  autoRefreshIntervalMinutes: number;
  setRelativeRefreshTick: Dispatch<SetStateAction<number>>;
}

/**
 * Owns the dashboard's periodic relative-time updates and background refresh cadence.
 *
 * React 19 effect events let the intervals read the latest refresh callback
 * without rebuilding timers whenever the selected feed context changes.
 */
export function useDashboardIntervals({
  autoRefreshFeedList,
  autoRefreshIntervalMinutes,
  setRelativeRefreshTick,
}: UseDashboardIntervalsOptions) {
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRelativeRefreshTick((current) => current + 1);
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [setRelativeRefreshTick]);

  const lastFiredAtRef = useRef(Date.now());
  const runRefresh = useEffectEvent(() => {
    lastFiredAtRef.current = Date.now();
    autoRefreshFeedList();
  });

  useEffect(() => {
    const autoRefreshIntervalMs = toAutoRefreshIntervalMs(
      autoRefreshIntervalMinutes,
    );

    lastFiredAtRef.current = Date.now();

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      runRefresh();
    }, autoRefreshIntervalMs);

    // When returning to a suspended tab, delay briefly so the browser can
    // restore network connectivity before firing the refresh request.
    let resumeTimerId: ReturnType<typeof setTimeout> | undefined;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimeout(resumeTimerId);
        return;
      }
      if (Date.now() - lastFiredAtRef.current >= autoRefreshIntervalMs) {
        resumeTimerId = setTimeout(() => {
          if (!document.hidden) {
            runRefresh();
          }
        }, TAB_RESUME_DELAY_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      clearTimeout(resumeTimerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefreshIntervalMinutes]);
}
