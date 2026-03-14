"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";

import { toAutoRefreshIntervalMs } from "../services/refresh-policy";

interface UseDashboardIntervalsOptions {
  autoRefreshFeedList: () => void;
  autoRefreshIntervalMinutes: number;
  setRelativeRefreshTick: Dispatch<SetStateAction<number>>;
}

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

  // Keep a ref to the latest callback so the interval never resets when
  // selectedCategory / selectedFeed / etc. change identity.
  const autoRefreshRef = useRef(autoRefreshFeedList);
  useEffect(() => {
    autoRefreshRef.current = autoRefreshFeedList;
  }, [autoRefreshFeedList]);

  useEffect(() => {
    const autoRefreshIntervalMs = toAutoRefreshIntervalMs(
      autoRefreshIntervalMinutes,
    );

    // Tracks when the refresh was last actually performed (not skipped).
    // Initialized to now so the first interval fires at the correct offset.
    const lastFiredAtRef = { current: Date.now() };

    const runRefresh = () => {
      lastFiredAtRef.current = Date.now();
      autoRefreshRef.current();
    };

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
