import { describe, expect, test } from "bun:test";

import {
  resolveInvertedPaginationAnchorScrollTop,
  resolveNextVisibleCount,
  resolvePaginationBoundaryState,
  shouldAutoFillViewport,
} from "@/app/dashboard/components/feed/feed-list-surface-state/paginationRules";

function defineViewportMetric(
  viewport: HTMLElement,
  key: "clientHeight" | "scrollHeight" | "scrollTop",
  value: number,
) {
  Object.defineProperty(viewport, key, {
    configurable: true,
    get() {
      return value;
    },
  });
}

describe("resolvePaginationBoundaryState", () => {
  test("keeps inverted pagination disarmed until the reader really leaves the top edge", () => {
    const viewport = document.createElement("div");
    defineViewportMetric(viewport, "clientHeight", 480);
    defineViewportMetric(viewport, "scrollHeight", 1440);
    defineViewportMetric(viewport, "scrollTop", 0);

    expect(
      resolvePaginationBoundaryState({
        isInvertedScroll: true,
        scrollViewport: viewport,
      }),
    ).toEqual({
      hasMovedAwayFromBoundary: false,
      hasReachedBoundary: true,
    });
  });

  test("re-arms standard pagination only after the reader moves away from the bottom edge", () => {
    const viewport = document.createElement("div");
    defineViewportMetric(viewport, "clientHeight", 480);
    defineViewportMetric(viewport, "scrollHeight", 1440);
    defineViewportMetric(viewport, "scrollTop", 400);

    expect(
      resolvePaginationBoundaryState({
        isInvertedScroll: false,
        scrollViewport: viewport,
      }),
    ).toEqual({
      hasMovedAwayFromBoundary: true,
      hasReachedBoundary: false,
    });
  });
});

describe("resolveNextVisibleCount", () => {
  test("caps client pagination at the filtered feed length", () => {
    expect(
      resolveNextVisibleCount({
        articlesPerPage: 4,
        currentVisibleCount: 10,
        filteredFeedLength: 12,
      }),
    ).toBe(12);
  });
});

describe("shouldAutoFillViewport", () => {
  test("stops auto-fill once the reader has taken scroll ownership", () => {
    expect(
      shouldAutoFillViewport({
        clientHeight: 480,
        committedListHeight: 320,
        currentVisibleCount: 4,
        filteredFeedLength: 12,
        hasUserScrolled: true,
        isInitialLoading: false,
      }),
    ).toBe(false);
  });

  test("reveals one more page while the first paint still underfills the viewport", () => {
    expect(
      shouldAutoFillViewport({
        clientHeight: 480,
        committedListHeight: 320,
        currentVisibleCount: 4,
        filteredFeedLength: 12,
        hasUserScrolled: false,
        isInitialLoading: false,
      }),
    ).toBe(true);
  });
});

describe("resolveInvertedPaginationAnchorScrollTop", () => {
  test("moves scrollTop down when the anchored header drifts lower after prepend pagination", () => {
    expect(
      resolveInvertedPaginationAnchorScrollTop({
        anchorViewportOffsetTop: -21,
        currentAnchorOffsetTop: 552,
        currentScrollTop: 478,
      }),
    ).toBe(1051);
  });

  test("clamps the corrected scrollTop at zero when the anchor drifts upward", () => {
    expect(
      resolveInvertedPaginationAnchorScrollTop({
        anchorViewportOffsetTop: 40,
        currentAnchorOffsetTop: 0,
        currentScrollTop: 10,
      }),
    ).toBe(0);
  });
});