"use client";

import { clientFeedCacheTtlMinutes } from "@/lib/config";
import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";

interface UseDashboardIntervalsOptions {
  autoRefreshFeedList: () => void;
  setRelativeRefreshTick: Dispatch<SetStateAction<number>>;
}

export function useDashboardIntervals({
  autoRefreshFeedList,
  setRelativeRefreshTick,
}: UseDashboardIntervalsOptions) {
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRelativeRefreshTick((current) => current + 1);
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [setRelativeRefreshTick]);

  useEffect(() => {
    const autoRefreshIntervalMs =
      Math.max(clientFeedCacheTtlMinutes(), 1) * 60_000;

    const intervalId = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      autoRefreshFeedList();
    }, autoRefreshIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [autoRefreshFeedList]);
}
