"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useEffectEvent, useRef } from "react";

import { toAutoRefreshIntervalMs } from "../services/refresh-policy";

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

    // When returning to a hidden tab, fire immediately if the TTL has elapsed
    // since the last actual refresh instead of waiting a full cycle.
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      if (Date.now() - lastFiredAtRef.current >= autoRefreshIntervalMs) {
        runRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefreshIntervalMinutes]);
}
