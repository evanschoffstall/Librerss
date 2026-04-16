import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import { useDashboardBroadcasts } from "@/app/dashboard/dashboard-hooks/useDashboardBroadcasts";

function collectDashboardBroadcasts() {
  const shellLoadingStates: boolean[] = [];
  const pendingStates: boolean[] = [];
  const terms: string[] = [];
  const titles: string[] = [];

  const onShellLoading = (event: Event) => {
    shellLoadingStates.push(
      (event as CustomEvent<{ loading: boolean }>).detail.loading,
    );
  };

  const onTitleChange = (event: Event) => {
    titles.push((event as CustomEvent<{ title: string }>).detail.title);
  };
  const onSearchSync = (event: Event) => {
    terms.push((event as CustomEvent<{ term: string }>).detail.term);
  };
  const onSearchPending = (event: Event) => {
    pendingStates.push(
      (event as CustomEvent<{ pending: boolean }>).detail.pending,
    );
  };

  window.addEventListener(DASHBOARD_EVENTS.SHELL_LOADING, onShellLoading);
  window.addEventListener(DASHBOARD_EVENTS.TITLE_CHANGE, onTitleChange);
  window.addEventListener(DASHBOARD_EVENTS.SEARCH_SYNC, onSearchSync);
  window.addEventListener(DASHBOARD_EVENTS.SEARCH_PENDING, onSearchPending);

  return {
    pendingStates,
    restore() {
      window.removeEventListener(
        DASHBOARD_EVENTS.SHELL_LOADING,
        onShellLoading,
      );
      window.removeEventListener(DASHBOARD_EVENTS.TITLE_CHANGE, onTitleChange);
      window.removeEventListener(DASHBOARD_EVENTS.SEARCH_SYNC, onSearchSync);
      window.removeEventListener(
        DASHBOARD_EVENTS.SEARCH_PENDING,
        onSearchPending,
      );
    },
    shellLoadingStates,
    terms,
    titles,
  };
}

afterEach(() => {
  window.dispatchEvent(
    new CustomEvent(DASHBOARD_EVENTS.TITLE_CHANGE, {
      detail: { title: "cleanup" },
    }),
  );
});

describe("dashboard broadcasts", () => {
  test("emits title, search term, and pending events on mount", () => {
    const broadcasts = collectDashboardBroadcasts();

    try {
      renderHook(() =>
        useDashboardBroadcasts({
          isSearchPending: true,
          isShellLoading: true,
          searchTerm: "weather",
          selectedFeed: "NOAA",
        }),
      );

      expect(broadcasts.shellLoadingStates.at(-1)).toBe(true);
      expect(broadcasts.titles).toContain("NOAA");
      expect(broadcasts.terms).toContain("weather");
      expect(broadcasts.pendingStates.at(-1)).toBe(true);
    } finally {
      broadcasts.restore();
    }
  });

  test("emits updated values when the hook props change", () => {
    const broadcasts = collectDashboardBroadcasts();

    try {
      const { rerender } = renderHook(
        ({ isSearchPending, isShellLoading, searchTerm, selectedFeed }) =>
          useDashboardBroadcasts({
            isSearchPending,
            isShellLoading,
            searchTerm,
            selectedFeed,
          }),
        {
          initialProps: {
            isSearchPending: false,
            isShellLoading: false,
            searchTerm: "initial",
            selectedFeed: undefined as string | undefined,
          },
        },
      );

      rerender({
        isSearchPending: true,
        isShellLoading: true,
        searchTerm: "updated",
        selectedFeed: "USGS",
      });

      expect(broadcasts.shellLoadingStates.slice(-2)).toEqual([false, true]);
      expect(broadcasts.titles).toContain("LibreRSS");
      expect(broadcasts.titles.at(-1)).toBe("USGS");
      expect(broadcasts.terms).toContain("initial");
      expect(broadcasts.terms.at(-1)).toBe("updated");
      expect(broadcasts.pendingStates.slice(-2)).toEqual([false, true]);
    } finally {
      broadcasts.restore();
    }
  });
});
