"use client";

import { useMemo, useState } from "react";

import { formatLastRefreshLabel } from "@/app/dashboard/dashboard-services/feed-loader-state";

/**
 * Manage the refresh status.
 * @param usePlaceholderData - The placeholder data.
 * @returns The refresh status state and callbacks.
 */
export function useRefreshStatus(usePlaceholderData: boolean) {
  /** Last successful batch refresh time used for the filter-bar status label. */
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  /** Forces relative time labels to recompute on an interval without storing duplicate derived strings. */
  const [, setRelativeRefreshTick] = useState(0);

  const lastRefreshLabel = useMemo(
    () =>
      usePlaceholderData ? "demo" : formatLastRefreshLabel(lastRefreshedAt),
    [lastRefreshedAt, usePlaceholderData],
  );

  return {
    lastRefreshedAt,
    lastRefreshLabel,
    setLastRefreshedAt,
    setRelativeRefreshTick,
  };
}
