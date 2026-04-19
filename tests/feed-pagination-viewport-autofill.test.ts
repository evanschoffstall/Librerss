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

  test("still auto-fills when the viewport is underfilled and no lock is active", () => {
    const expandVisibleWindow = mock(() => true);

    maybeAutoFillViewportNow(
      createAutoFillOptions({
        expandVisibleWindow,
      }),
    );

    expect(expandVisibleWindow).toHaveBeenCalledWith(true);
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
});
