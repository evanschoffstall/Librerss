"use client";

import { useLayoutEffect } from "react";

import { type UseDashboardBroadcastsOptions } from "@/app/dashboard/dashboard-hooks/dashboard-effects.contracts";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";

/** Emits dashboard shell, title, and search state changes to shell-level listeners. */
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

    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SHELL_LOADING, {
        detail: { loading: isShellLoading },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.TITLE_CHANGE, {
        detail: { title: selectedFeed ?? "LibreRSS" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_SYNC, {
        detail: { term: searchTerm },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_PENDING, {
        detail: { pending: isSearchPending },
      }),
    );
  }, [isSearchPending, isShellLoading, searchTerm, selectedFeed]);
}
