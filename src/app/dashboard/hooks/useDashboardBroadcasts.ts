"use client";

import { useEffect, useLayoutEffect } from "react";

import { DASHBOARD_EVENTS } from "../constants";
import { type UseDashboardBroadcastsOptions } from "./dashboard-effects.contracts";

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
  }, [isShellLoading]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.TITLE_CHANGE, {
        detail: { title: selectedFeed ?? "LibreRSS" },
      }),
    );
  }, [selectedFeed]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_SYNC, {
        detail: { term: searchTerm },
      }),
    );
  }, [searchTerm]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_PENDING, {
        detail: { pending: isSearchPending },
      }),
    );
  }, [isSearchPending]);
}