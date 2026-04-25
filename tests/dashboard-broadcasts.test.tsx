import { describe, expect, test } from "bun:test";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import { dispatchDashboardBroadcasts } from "@/app/dashboard/dashboard-hooks/useDashboardBroadcasts";

function collectDashboardBroadcasts() {
  const shellLoadingStates: boolean[] = [];
  const pendingStates: boolean[] = [];
  const terms: string[] = [];
  const titles: string[] = [];
  const target = {
    dispatchEvent(event: Event) {
      if (event.type === DASHBOARD_EVENTS.SHELL_LOADING) {
        shellLoadingStates.push(
          (event as CustomEvent<{ loading: boolean }>).detail.loading,
        );
      }
      if (event.type === DASHBOARD_EVENTS.TITLE_CHANGE) {
        titles.push((event as CustomEvent<{ title: string }>).detail.title);
      }
      if (event.type === DASHBOARD_EVENTS.SEARCH_SYNC) {
        terms.push((event as CustomEvent<{ term: string }>).detail.term);
      }
      if (event.type === DASHBOARD_EVENTS.SEARCH_PENDING) {
        pendingStates.push(
          (event as CustomEvent<{ pending: boolean }>).detail.pending,
        );
      }

      return true;
    },
  } satisfies Pick<Window, "dispatchEvent">;

  return {
    pendingStates,
    shellLoadingStates,
    target,
    terms,
    titles,
  };
}

describe("dashboard broadcasts", () => {
  test("dispatches title, search term, and pending events", () => {
    const broadcasts = collectDashboardBroadcasts();

    dispatchDashboardBroadcasts(broadcasts.target, {
      isSearchPending: true,
      isShellLoading: true,
      searchTerm: "weather-broadcast-test",
      selectedFeed: "NOAA",
    });

    expect(broadcasts.shellLoadingStates).toContain(true);
    expect(broadcasts.titles).toContain("NOAA");
    expect(broadcasts.terms).toContain("weather-broadcast-test");
    expect(broadcasts.pendingStates).toContain(true);
  });

  test("dispatches updated values when the dashboard state changes", () => {
    const broadcasts = collectDashboardBroadcasts();

    dispatchDashboardBroadcasts(broadcasts.target, {
      isSearchPending: false,
      isShellLoading: false,
      searchTerm: "initial-broadcast-test",
      selectedFeed: undefined,
    });
    dispatchDashboardBroadcasts(broadcasts.target, {
      isSearchPending: true,
      isShellLoading: true,
      searchTerm: "updated-broadcast-test",
      selectedFeed: "USGS",
    });

    expect(broadcasts.shellLoadingStates).toEqual([false, true]);
    expect(broadcasts.titles).toEqual(["LibreRSS", "USGS"]);
    expect(broadcasts.terms).toEqual([
      "initial-broadcast-test",
      "updated-broadcast-test",
    ]);
    expect(broadcasts.pendingStates).toEqual([false, true]);
  });
});
