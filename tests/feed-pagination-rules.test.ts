import { describe, expect, test } from "bun:test";

import {
  hasMovedAwayFromBoundarySincePreviousScroll,
  resolveInvertedPaginationAnchorScrollTop,
  resolveNextVisibleCount,
  resolvePaginationBoundaryState,
  shouldAutoFillViewport,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state";

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

  test("starts standard pagination once the reader crosses 70 percent scroll progress", () => {
    const viewport = document.createElement("div");
    defineViewportMetric(viewport, "clientHeight", 480);
    defineViewportMetric(viewport, "scrollHeight", 1440);
    defineViewportMetric(viewport, "scrollTop", 768);

    expect(
      resolvePaginationBoundaryState({
        isInvertedScroll: false,
        scrollViewport: viewport,
      }),
    ).toEqual({
      hasMovedAwayFromBoundary: false,
      hasReachedBoundary: true,
    });
  });

  test("keeps standard pagination disarmed before the 70 percent threshold", () => {
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

  test("preserves inverted boundary departure when the current scroll lands back at the top", () => {
    const viewport = document.createElement("div");
    defineViewportMetric(viewport, "clientHeight", 480);
    defineViewportMetric(viewport, "scrollHeight", 1440);
    defineViewportMetric(viewport, "scrollTop", 0);

    expect(
      hasMovedAwayFromBoundarySincePreviousScroll({
        isInvertedScroll: true,
        previousScrollTop: 640,
        scrollViewport: viewport,
      }),
    ).toBe(true);
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
        articleFilter: "all",
        articlesPerPage: 4,
        clientHeight: 480,
        committedListHeight: 320,
        currentVisibleCount: 4,
        filteredFeedLength: 12,
        hasUserScrolled: true,
        isInitialLoading: false,
      }),
    ).toBe(false);
  });

  test("reveals the visible window while the first paint is below the clipped-overflow count", () => {
    expect(
      shouldAutoFillViewport({
        activeViewportRefillTargetVisibleCount: null,
        articleFilter: "all",
        articlesPerPage: 4,
        clientHeight: 480,
        committedListHeight: 160,
        currentVisibleCount: 3,
        filteredFeedLength: 12,
        hasUserScrolled: false,
        isInitialLoading: false,
      }),
    ).toBe(true);
  });

  test("reveals the clipped overflow row after the configured page is present", () => {
    expect(
      shouldAutoFillViewport({
        activeViewportRefillTargetVisibleCount: null,
        articleFilter: "all",
        articlesPerPage: 4,
        clientHeight: 480,
        committedListHeight: 480,
        currentVisibleCount: 4,
        filteredFeedLength: 12,
        hasListShrunk: false,
        hasUserScrolled: false,
        isInitialLoading: false,
      }),
    ).toBe(true);
  });

  test("continues generic auto-fill until the clipped overflow row exists", () => {
    expect(
      shouldAutoFillViewport({
        activeViewportRefillTargetVisibleCount: null,
        articleFilter: "all",
        articlesPerPage: 4,
        clientHeight: 480,
        committedListHeight: 10,
        currentVisibleCount: 5,
        filteredFeedLength: 20,
        hasListShrunk: false,
        hasUserScrolled: false,
        isInitialLoading: false,
      }),
    ).toBe(true);
  });

  test("stops generic auto-fill once the clipped overflow row is present", () => {
    expect(
      shouldAutoFillViewport({
        activeViewportRefillTargetVisibleCount: null,
        articleFilter: "unread",
        articlesPerPage: 4,
        clientHeight: 480,
        committedListHeight: 600,
        currentVisibleCount: 5,
        filteredFeedLength: 20,
        hasListShrunk: true,
        hasUserScrolled: false,
        isInitialLoading: false,
      }),
    ).toBe(false);
  });

  test("applies clipped overflow recovery to non-unread shrink recovery", () => {
    expect(
      shouldAutoFillViewport({
        activeViewportRefillTargetVisibleCount: null,
        articleFilter: "all",
        articlesPerPage: 4,
        clientHeight: 480,
        committedListHeight: 10,
        currentVisibleCount: 4,
        filteredFeedLength: 20,
        hasListShrunk: true,
        hasUserScrolled: false,
        isInitialLoading: false,
      }),
    ).toBe(true);
  });

  test("continues auto-fill past the clipped row when an owned refill target is active", () => {
    expect(
      shouldAutoFillViewport({
        activeViewportRefillTargetVisibleCount: 8,
        articleFilter: "all",
        articlesPerPage: 4,
        clientHeight: 480,
        committedListHeight: 320,
        currentVisibleCount: 4,
        filteredFeedLength: 12,
        hasUserScrolled: false,
        isInitialLoading: false,
      }),
    ).toBe(true);
  });

  test("stops generic auto-fill once an owned refill target has been satisfied", () => {
    expect(
      shouldAutoFillViewport({
        activeViewportRefillTargetVisibleCount: 8,
        articleFilter: "all",
        articlesPerPage: 4,
        clientHeight: 780,
        committedListHeight: 920,
        currentVisibleCount: 8,
        filteredFeedLength: 12,
        hasUserScrolled: false,
        isInitialLoading: false,
      }),
    ).toBe(false);
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
