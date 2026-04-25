import { describe, expect, mock, test } from "bun:test";

import { maybeAutoFillViewportNow } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedPaginationViewportAutoFill";

function createAutoFillOptions(
  overrides: Partial<
    Parameters<typeof maybeAutoFillViewportNow>[0]
  > = {},
): Parameters<typeof maybeAutoFillViewportNow>[0] {
  return {
    articleFilter: "all",
    articlesPerPage: 4,
    canLoadMoreFromServer: true,
    expandedArticleKey: null,
    expandVisibleWindow: mock(() => true),
    filteredFeedLengthRef: { current: 12 },
    hasActiveInvertedExpansionScrollLock: mock(() => false),
    hasPendingServerRevealRef: { current: false },
    hasRequestedServerLoadRef: { current: false },
    hasUserScrolledRef: { current: false },
    isInitialLoading: false,
    isInvertedScroll: false,
    isStandardViewportRefillActiveRef: { current: false },
    lastAutoFillListHeightRef: { current: null },
    requestMoreFromServer: mock(() => false),
    scrollViewport: createViewport(),
    standardViewportRefillTargetVisibleCountRef: { current: null },
    visibleArticleCountRef: { current: 4 },
    ...overrides,
  };
}

function createViewport() {
  const viewport = document.createElement("div");
  Object.defineProperty(viewport, "clientHeight", {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(viewport, "scrollHeight", {
    configurable: true,
    value: 400,
  });

  return viewport;
}

describe("maybeAutoFillViewportNow", () => {
  test("skips viewport auto-fill while an article is expanded", () => {
    const expandVisibleWindow = mock(() => true);

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        expandedArticleKey: "article-3",
        expandVisibleWindow,
      }),
    );

    expect(expandVisibleWindow).not.toHaveBeenCalled();
  });

  test("skips inverted viewport auto-fill while the expansion lock is active", () => {
    const expandVisibleWindow = mock(() => true);

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        expandVisibleWindow,
        hasActiveInvertedExpansionScrollLock: mock(() => true),
        isInvertedScroll: true,
      }),
    );

    expect(expandVisibleWindow).not.toHaveBeenCalled();
  });

  test("auto-fills when the viewport is underfilled and the visible count is below the one-page ceiling", () => {
    const expandVisibleWindow = mock(() => true);

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        expandVisibleWindow,
        visibleArticleCountRef: { current: 3 },
      }),
    );

    expect(expandVisibleWindow).toHaveBeenCalledWith(true);
  });

  test("does not auto-fill past one page even when the list is shorter than the viewport (count ceiling enforced)", () => {
    // scrollHeight (400) < clientHeight (600): the count ceiling still applies.
    // Auto-fill must not expand past one configured page regardless of whether
    // the committed list height has reached the viewport height.
    const expandVisibleWindow = mock(() => true);

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        expandVisibleWindow,
        standardViewportRefillTargetVisibleCountRef: { current: null },
        visibleArticleCountRef: { current: 4 },
      }),
    );

    expect(expandVisibleWindow).not.toHaveBeenCalled();
  });

  test("does not auto-fill when the list exceeds the viewport height and the visible count has reached one page with no owned target", () => {
    // scrollHeight (700) > clientHeight (600): list is already scrollable.
    // The height-based ceiling stops auto-fill here.
    const expandVisibleWindow = mock(() => true);
    const viewport = document.createElement("div");

    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      value: 700,
    });

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        expandVisibleWindow,
        scrollViewport: viewport,
        standardViewportRefillTargetVisibleCountRef: { current: null },
        visibleArticleCountRef: { current: 4 },
      }),
    );

    expect(expandVisibleWindow).not.toHaveBeenCalled();
  });

  test("does not inflate the visible window from local backlog during an active standard viewport refill", () => {
    const expandVisibleWindow = mock(() => true);

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        articleFilter: "unread",
        expandVisibleWindow,
        hasUserScrolledRef: { current: true },
        isStandardViewportRefillActiveRef: { current: true },
        standardViewportRefillTargetVisibleCountRef: { current: 8 },
        visibleArticleCountRef: { current: 8 },
      }),
    );

    expect(expandVisibleWindow).not.toHaveBeenCalled();
  });

  test("keeps standard viewport refill ownership while a server refill is still pending", () => {
    const isStandardViewportRefillActiveRef = { current: true };
    const standardViewportRefillTargetVisibleCountRef = { current: 8 };

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        articleFilter: "unread",
        filteredFeedLengthRef: { current: 2 },
        hasPendingServerRevealRef: { current: true },
        hasRequestedServerLoadRef: { current: true },
        isStandardViewportRefillActiveRef,
        standardViewportRefillTargetVisibleCountRef,
        visibleArticleCountRef: { current: 2 },
      }),
    );

    expect(isStandardViewportRefillActiveRef.current).toBe(true);
    expect(standardViewportRefillTargetVisibleCountRef.current).toBe(8);
  });

  test("requests another server refill page only once the unread backlog drops below the overflow threshold", () => {
    const expandVisibleWindow = mock(() => true);
    const requestMoreFromServer = mock(() => true);

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        articleFilter: "unread",
        expandVisibleWindow,
        filteredFeedLengthRef: { current: 4 },
        hasUserScrolledRef: { current: true },
        isStandardViewportRefillActiveRef: { current: true },
        requestMoreFromServer,
        standardViewportRefillTargetVisibleCountRef: { current: 8 },
        visibleArticleCountRef: { current: 2 },
      }),
    );

    expect(expandVisibleWindow).toHaveBeenCalledWith(true);
    expect(requestMoreFromServer).toHaveBeenCalledWith({
      isViewportRefill: true,
    });
  });

  test("requests another server refill page when an active unread refill has exhausted the local backlog below the overflow threshold", () => {
    const requestMoreFromServer = mock(() => true);

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        articleFilter: "unread",
        filteredFeedLengthRef: { current: 2 },
        hasUserScrolledRef: { current: true },
        isStandardViewportRefillActiveRef: { current: true },
        requestMoreFromServer,
        standardViewportRefillTargetVisibleCountRef: { current: 8 },
        visibleArticleCountRef: { current: 2 },
      }),
    );

    expect(requestMoreFromServer).toHaveBeenCalledWith({
      isViewportRefill: true,
    });
  });

  test("requests another server refill page when an active unread refill is above the overflow threshold but still below its owned target", () => {
    const requestMoreFromServer = mock(() => true);

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        allowOwnedTargetContinuationWithoutLocalBacklog: true,
        articleFilter: "unread",
        filteredFeedLengthRef: { current: 6 },
        hasUserScrolledRef: { current: true },
        isStandardViewportRefillActiveRef: { current: true },
        requestMoreFromServer,
        standardViewportRefillTargetVisibleCountRef: { current: 8 },
        visibleArticleCountRef: { current: 6 },
      }),
    );

    expect(requestMoreFromServer).toHaveBeenCalledWith({
      isViewportRefill: true,
    });
  });
});
