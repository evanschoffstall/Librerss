"use client";

import { useLayoutEffect } from "react";

import { type UseDashboardBroadcastsOptions } from "@/app/dashboard/dashboard-hooks/dashboard-effects.contracts";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";

/**
 * Emits the dashboard shell, title, and search events to the provided target.
 * @param target
 * @param root0
 * @param root0.isSearchPending
 * @param root0.isShellLoading
 * @param root0.searchTerm
 * @param root0.selectedFeed
 */
export function dispatchDashboardBroadcasts(
  target: Pick<Window, "dispatchEvent">,
  {
    isSearchPending,
    isShellLoading,
    searchTerm,
    selectedFeed,
  }: UseDashboardBroadcastsOptions,
) {
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
 * Emits dashboard shell, title, and search state changes to shell-level listeners.
 * @param root0
 * @param root0.isSearchPending
 * @param root0.isShellLoading
 * @param root0.searchTerm
 * @param root0.selectedFeed
 */
export function useDashboardBroadcasts({
  isSearchPending,
  isShellLoading,
  searchTerm,
  selectedFeed,
}: UseDashboardBroadcastsOptions) {
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
