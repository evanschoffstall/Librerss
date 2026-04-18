"use client";

import { useLayoutEffect } from "react";

import { type UseDashboardBroadcastsOptions } from "@/app/dashboard/dashboard-hooks/dashboard-effects.contracts";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";

/**
 * Process the dispatch dashboard broadcasts.
 * @param target - The target.
 * @param options - The options used to process the dispatch dashboard broadcasts.
 */
export function dispatchDashboardBroadcasts(
  target: Pick<Window, "dispatchEvent">,
  options: UseDashboardBroadcastsOptions,
) {
  const { isSearchPending, isShellLoading, searchTerm, selectedFeed } = options;
  target.dispatchEvent(
    new CustomEvent(DASHBOARD_EVENTS.SHELL_LOADING, {
      detail: { loading: isShellLoading },
    }),
  );
  target.dispatchEvent(
    new CustomEvent(DASHBOARD_EVENTS.TITLE_CHANGE, {
      detail: { title: selectedFeed ?? "LibreRSS" },
    }),
  );
  target.dispatchEvent(
    new CustomEvent(DASHBOARD_EVENTS.SEARCH_SYNC, {
      detail: { term: searchTerm },
    }),
  );
  target.dispatchEvent(
    new CustomEvent(DASHBOARD_EVENTS.SEARCH_PENDING, {
      detail: { pending: isSearchPending },
    }),
  );
}

/**
 * Manage the dashboard broadcasts.
 * @param options - The options used to manage the dashboard broadcasts.
 */
export function useDashboardBroadcasts(options: UseDashboardBroadcastsOptions) {
  const { isSearchPending, isShellLoading, searchTerm, selectedFeed } = options;
  useLayoutEffect(() => {
    document.documentElement.dataset.dashboardShellLoading = isShellLoading
      ? "true"
      : "false";

    dispatchDashboardBroadcasts(window, {
      isSearchPending,
      isShellLoading,
      searchTerm,
      selectedFeed,
    });
  }, [isSearchPending, isShellLoading, searchTerm, selectedFeed]);
}
