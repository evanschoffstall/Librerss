import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  readDashboardShellLoadingFromDocument,
  readDashboardShellLoadingFromEvent,
  resolveDashboardShellLoadingState,
} from "@/app/dashboard/toolbar/useDashboardShellLoadingState";

describe("useDashboardToolbarState shell loading", () => {
  const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "readyState",
  );

  beforeEach(() => {
    mock.restore();
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete document.documentElement.dataset.dashboardShellLoading;
  });

  afterEach(() => {
    mock.restore();
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete document.documentElement.dataset.dashboardShellLoading;

    if (originalReadyStateDescriptor) {
      Object.defineProperty(
        document,
        "readyState",
        originalReadyStateDescriptor,
      );
    }
  });

  test("settles optimistic shell loading once the document is already complete", () => {
    expect(
      resolveDashboardShellLoadingState({
        hasReceivedShellLoadingEvent: false,
        readyState: "complete",
        shellLoadingFromDocument: null,
      }),
    ).toBe(false);

    expect(
      resolveDashboardShellLoadingState({
        hasReceivedShellLoadingEvent: true,
        readyState: "complete",
        shellLoadingFromDocument: null,
      }),
    ).toBeNull();

    expect(
      resolveDashboardShellLoadingState({
        hasReceivedShellLoadingEvent: false,
        readyState: "loading",
        shellLoadingFromDocument: null,
      }),
    ).toBeNull();
  });

  test("prefers the document dataset before bus events arrive", () => {
    document.documentElement.setAttribute(
      "data-dashboard-shell-loading",
      "true",
    );

    expect(readDashboardShellLoadingFromDocument()).toBe(true);
    expect(
      resolveDashboardShellLoadingState({
        hasReceivedShellLoadingEvent: false,
        readyState: "loading",
        shellLoadingFromDocument: readDashboardShellLoadingFromDocument(),
      }),
    ).toBe(true);

    document.documentElement.setAttribute(
      "data-dashboard-shell-loading",
      "false",
    );
    expect(readDashboardShellLoadingFromDocument()).toBe(false);

    delete document.documentElement.dataset.dashboardShellLoading;
    expect(readDashboardShellLoadingFromDocument()).toBeNull();
  });

  test("updates shell loading from window bus events", () => {
    expect(
      readDashboardShellLoadingFromEvent(
        new CustomEvent("dashboard:shell-loading", {
          detail: { loading: true },
        }),
      ),
    ).toBe(true);

    expect(
      readDashboardShellLoadingFromEvent(
        new CustomEvent("dashboard:shell-loading", {
          detail: { loading: false },
        }),
      ),
    ).toBe(false);

    expect(
      readDashboardShellLoadingFromEvent(
        new CustomEvent("dashboard:shell-loading", {
          detail: {},
        }),
      ),
    ).toBe(false);
  });
});
