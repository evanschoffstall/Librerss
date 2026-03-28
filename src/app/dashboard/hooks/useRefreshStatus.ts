"use client";

import { useMemo, useState } from "react";

import { formatLastRefreshLabel } from "../services/feed-loader-helpers";

/**
 * Owns the dashboard refresh-status state used by the filter bar.
 *
 * The hook keeps the timestamp and its periodic recompute trigger together so
 * the top-level controller does not need to manage refresh-label bookkeeping
 * inline.
 *
 * @param usePlaceholderData Whether the dashboard is currently running in preview mode.
 * @returns Refresh timestamp state, label, and tick setter used by the refresh interval.
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
