import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import { useDashboardBroadcasts } from "@/app/dashboard/hooks/useDashboardBroadcasts";

function collectDashboardBroadcasts() {
  const pendingStates: boolean[] = [];
  const terms: string[] = [];
  const titles: string[] = [];

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

  window.addEventListener(DASHBOARD_EVENTS.TITLE_CHANGE, onTitleChange);
  window.addEventListener(DASHBOARD_EVENTS.SEARCH_SYNC, onSearchSync);
  window.addEventListener(DASHBOARD_EVENTS.SEARCH_PENDING, onSearchPending);

  return {
    pendingStates,
    restore() {
      window.removeEventListener(DASHBOARD_EVENTS.TITLE_CHANGE, onTitleChange);
      window.removeEventListener(DASHBOARD_EVENTS.SEARCH_SYNC, onSearchSync);
      window.removeEventListener(
        DASHBOARD_EVENTS.SEARCH_PENDING,
        onSearchPending,
      );
    },
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
          searchTerm: "weather",
          selectedFeed: "NOAA",
        }),
      );

      expect(broadcasts.titles).toEqual(["NOAA"]);
      expect(broadcasts.terms).toEqual(["weather"]);
      expect(broadcasts.pendingStates).toEqual([true]);
    } finally {
      broadcasts.restore();
    }
  });

  test("emits updated values when the hook props change", () => {
    const broadcasts = collectDashboardBroadcasts();

    try {
      const { rerender } = renderHook(
        ({ isSearchPending, searchTerm, selectedFeed }) =>
          useDashboardBroadcasts({
            isSearchPending,
            searchTerm,
            selectedFeed,
          }),
        {
          initialProps: {
            isSearchPending: false,
            searchTerm: "initial",
            selectedFeed: undefined as string | undefined,
          },
        },
      );

      rerender({
        isSearchPending: true,
        searchTerm: "updated",
        selectedFeed: "USGS",
      });

      expect(broadcasts.titles).toEqual(["LibreRSS", "USGS"]);
      expect(broadcasts.terms).toEqual(["initial", "updated"]);
      expect(broadcasts.pendingStates).toEqual([false, true]);
    } finally {
      broadcasts.restore();
    }
  });
});