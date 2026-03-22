"use client";

import { useEffect } from "react";

import { DASHBOARD_EVENTS } from "../constants";
import { type UseDashboardBroadcastsOptions } from "./dashboard-effects.types";

/** Emits dashboard title and search state changes to shell-level listeners. */
export function useDashboardBroadcasts({
  isSearchPending,
  searchTerm,
  selectedFeed,
}: UseDashboardBroadcastsOptions) {
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