import { afterEach, describe, expect, test } from "bun:test";

import {
  buildFeedSurfacePresentationState,
  buildFeedVirtualListEntries,
  collectFullyVisibleArticleKeys,
  findInvertedExpansionHeaderAnchor,
  findInvertedExpansionLockAnchor,
  findTopVisibleInvertedPaginationAnchorArticleKey,
  findVisibleInvertedRemovalAnchorArticleKey,
  getViewportOffsetTop,
  isInvertedExpansionLockViewport,
  isInvertedFeedScrollMode,
  observeInvertedExpansionScrollLockLayout,
  readPreparedArticleKey,
  resolveFeedScrollMode,
  resolveFeedScrollModeArticles,
  resolveFeedVirtualListOverscanCount,
  resolveInvertedExpansionLockViewport,
  resolveInvertedPaginationAnchorScrollTop,
  resolveNextVisibleCount,
  resolvePaginationBoundaryState,
  shouldAutoAnchorInvertedScrollViewport,
  shouldAutoFillViewport,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state";

import { buildFeedListArticle } from "./feed-list-test-utils";

if (typeof globalThis.CSS === "undefined") {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: {
      escape(value: string) {
        return value.replaceAll('"', '\\"');
      },
    },
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

function appendArticle(
  viewport: HTMLElement,
  articleKey: string,
  articleTop: number,
  articleHeight = 96,
  headerTop = articleTop,
  headerHeight = 44,
) {
  const articleElement = document.createElement("article");
  articleElement.dataset.articleKey = articleKey;
  articleElement.dataset.scrollRestoreKey = articleKey;
  articleElement.getBoundingClientRect = () =>
    createRect(articleTop, articleHeight);

  const headerElement = document.createElement("div");
  headerElement.dataset.articleSwipeZone = "header";
  headerElement.getBoundingClientRect = () =>
    createRect(headerTop, headerHeight);

  articleElement.append(headerElement);
  viewport.append(articleElement);

  return { articleElement, headerElement };
}

function createRect(top: number, height: number) {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 320,
    toJSON: () => ({}),
    top,
    width: 320,
    x: 0,
    y: top,
  };
}

describe("feed scroll mode helpers", () => {
  test("resolve the mode and article order for standard and inverted feeds", () => {
    const first = buildFeedListArticle({
      id: 1,
      link: "https://example.com/a",
    });
    const second = buildFeedListArticle({
      id: 2,
      link: "https://example.com/b",
    });
    const visibleArticles = [first, second];

    expect(isInvertedFeedScrollMode("inverted")).toBe(true);
    expect(isInvertedFeedScrollMode("standard")).toBe(false);
    expect(resolveFeedScrollMode(true, true)).toBe("inverted");
    expect(resolveFeedScrollMode(true, false)).toBe("standard");
    expect(resolveFeedScrollMode(false, true)).toBe("standard");
    expect(resolveFeedScrollModeArticles(visibleArticles, "standard")).toBe(
      visibleArticles,
    );
    expect(resolveFeedScrollModeArticles(visibleArticles, "inverted")).toEqual([
      second,
      first,
    ]);
  });
});

describe("feed virtual list layout helpers", () => {
  test("build virtual entries in the expected boundary order", () => {
    const first = buildFeedListArticle({
      id: 1,
      link: "https://example.com/a",
    });
    const second = buildFeedListArticle({
      id: 2,
      link: "https://example.com/b",
    });

    expect(
      buildFeedVirtualListEntries(
        [first, second],
        "feed-view",
        "standard",
        false,
      ),
    ).toEqual([
      { article: first, key: first.link, kind: "article" },
      { article: second, key: second.link, kind: "article" },
    ]);

    expect(
      buildFeedVirtualListEntries(
        [first, second],
        "feed-view",
        "standard",
        true,
      ),
    ).toEqual([
      { article: first, key: first.link, kind: "article" },
      { article: second, key: second.link, kind: "article" },
      { key: "feed-view:load-more-boundary", kind: "boundary" },
    ]);

    expect(
      buildFeedVirtualListEntries(
        [first, second],
        "feed-view",
        "inverted",
        true,
      ),
    ).toEqual([
      { key: "feed-view:load-more-boundary", kind: "boundary" },
      { article: first, key: first.link, kind: "article" },
      { article: second, key: second.link, kind: "article" },
    ]);
  });

  test("resolve overscan from viewport padding contracts", () => {
    expect(
      resolveFeedVirtualListOverscanCount(0, "standard", null, false),
    ).toBe(600);
    expect(
      resolveFeedVirtualListOverscanCount(200, "standard", null, false),
    ).toBe(5);
    expect(
      resolveFeedVirtualListOverscanCount(100, "inverted", null, false),
    ).toBe(4);
    expect(
      resolveFeedVirtualListOverscanCount(200, "inverted", "expanded", false),
    ).toBe(50);
    expect(
      resolveFeedVirtualListOverscanCount(200, "inverted", null, true),
    ).toBe(50);
  });
});

describe("feed surface presentation helpers", () => {
  test("derive skeleton, empty, virtualized, and plain states", () => {
    expect(
      buildFeedSurfacePresentationState({
        filteredFeedLength: 3,
        isInitialLoading: true,
        searchTerm: "  query ",
        shouldUseVirtualizedFeed: true,
        viewportResolutionState: "ready",
      }),
    ).toEqual({
      contentKey: "feed-skeleton",
      feedSurfaceMode: "skeleton",
      hasSearchTerm: true,
      shouldShowViewportResolutionSkeleton: false,
      trimmedSearchTerm: "query",
    });

    expect(
      buildFeedSurfacePresentationState({
        filteredFeedLength: 0,
        isInitialLoading: false,
        searchTerm: "   ",
        shouldUseVirtualizedFeed: true,
        viewportResolutionState: "ready",
      }).feedSurfaceMode,
    ).toBe("empty");

    expect(
      buildFeedSurfacePresentationState({
        filteredFeedLength: 3,
        isInitialLoading: false,
        searchTerm: "query",
        shouldUseVirtualizedFeed: true,
        viewportResolutionState: "pending",
      }).contentKey,
    ).toBe("feed-viewport-skeleton");

    expect(
      buildFeedSurfacePresentationState({
        filteredFeedLength: 3,
        isInitialLoading: false,
        searchTerm: "query",
        shouldUseVirtualizedFeed: true,
        viewportResolutionState: "ready",
      }).feedSurfaceMode,
    ).toBe("virtualized");

    expect(
      buildFeedSurfacePresentationState({
        filteredFeedLength: 3,
        isInitialLoading: false,
        searchTerm: "query",
        shouldUseVirtualizedFeed: false,
        viewportResolutionState: "ready",
      }).feedSurfaceMode,
    ).toBe("plain");
  });
});

describe("feed pagination rule helpers", () => {
  test("cover remaining pagination boundary and auto-fill branches", () => {
    const viewport = document.createElement("div");
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      value: 920,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: Number.NaN,
    });

    expect(
      resolvePaginationBoundaryState({
        isInvertedScroll: true,
        scrollViewport: viewport,
      }),
    ).toEqual({ hasMovedAwayFromBoundary: false, hasReachedBoundary: false });
    expect(
      resolvePaginationBoundaryState({
        isInvertedScroll: false,
        scrollViewport: viewport,
      }),
    ).toEqual({ hasMovedAwayFromBoundary: false, hasReachedBoundary: false });
    expect(
      resolveNextVisibleCount({
        articlesPerPage: 5,
        currentVisibleCount: 12,
        filteredFeedLength: 12,
      }),
    ).toBe(12);
    expect(
      shouldAutoFillViewport({
        articleFilter: "all",
        articlesPerPage: 4,
        clientHeight: 480,
        committedListHeight: Number.NaN,
        currentVisibleCount: 4,
        filteredFeedLength: 12,
        hasUserScrolled: false,
        isInitialLoading: false,
      }),
    ).toBe(false);
    expect(
      resolveInvertedPaginationAnchorScrollTop({
        anchorViewportOffsetTop: 100,
        currentAnchorOffsetTop: 120,
        currentScrollTop: 50,
      }),
    ).toBe(70);
  });
});

describe("feed DOM helpers", () => {
  test("resolve visible article keys, anchors, offsets, and viewport selection", () => {
    const viewport = document.createElement("div");
    const siblingViewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    siblingViewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(100, 240);
    siblingViewport.getBoundingClientRect = () => createRect(100, 240);

    const virtualizer = document.createElement("div");
    virtualizer.dataset.feedVirtualizer = "true";
    viewport.append(virtualizer);
    siblingViewport.append(document.createElement("div"));

    const first = appendArticle(viewport, "article-1", 110, 80, 110, 32);
    const siblingFirst = appendArticle(
      siblingViewport,
      "article-1",
      110,
      80,
      110,
      32,
    );
    appendArticle(viewport, "article-2", 280, 96, 280, 44);
    appendArticle(viewport, "article-3", 40, 96, 40, 44);
    document.body.append(viewport, siblingViewport);

    expect(collectFullyVisibleArticleKeys(viewport)).toEqual(["article-1"]);
    expect(findInvertedExpansionHeaderAnchor("article-1")).toBe(
      first.headerElement,
    );
    expect(findInvertedExpansionHeaderAnchor("article-1", viewport)).toBe(
      first.headerElement,
    );
    expect(
      findInvertedExpansionHeaderAnchor("article-1", siblingViewport),
    ).toBe(siblingFirst.headerElement);
    expect(findInvertedExpansionHeaderAnchor(null)).toBeNull();
    expect(findInvertedExpansionLockAnchor("article-1")).toBe(
      first.articleElement,
    );
    expect(findInvertedExpansionLockAnchor("article-1", viewport)).toBe(
      first.articleElement,
    );
    expect(findInvertedExpansionLockAnchor("article-1", siblingViewport)).toBe(
      siblingFirst.articleElement,
    );
    expect(findInvertedExpansionLockAnchor(null)).toBeNull();
    expect(getViewportOffsetTop(first.articleElement, viewport)).toBe(10);
    expect(getViewportOffsetTop(null, viewport)).toBe(0);
    expect(isInvertedExpansionLockViewport(viewport)).toBe(true);
    expect(
      resolveInvertedExpansionLockViewport(
        "article-1",
        document.createElement("div"),
      ),
    ).toBe(viewport);

    const disconnectedFallback = document.createElement("div");
    document.body.innerHTML = "";
    expect(
      resolveInvertedExpansionLockViewport("missing", disconnectedFallback),
    ).toBeNull();
  });

  test("pick stable pagination and survivor anchors directly from the DOM helper surface", () => {
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(100, 220);
    const virtualizer = document.createElement("div");
    virtualizer.dataset.feedVirtualizer = "true";
    viewport.append(virtualizer);

    appendArticle(viewport, "article-1", 90, 96, 90, 44);
    appendArticle(viewport, "article-2", 150, 96, 150, 44);
    appendArticle(viewport, "article-3", 270, 96, 270, 44);
    document.body.append(viewport);

    // Pagination anchoring prefers the first visible article that reaches the
    // stable offset inside the viewport, rather than the partially visible row.
    expect(findTopVisibleInvertedPaginationAnchorArticleKey()).toBe(
      "article-3",
    );
    expect(
      findVisibleInvertedRemovalAnchorArticleKey(new Set(["article-1"])),
    ).toBe("article-2");

    document.body.innerHTML = "";
    expect(findTopVisibleInvertedPaginationAnchorArticleKey()).toBeNull();
    expect(findVisibleInvertedRemovalAnchorArticleKey(new Set())).toBeNull();
  });

  test("read prepared keys and auto-anchor gating", () => {
    expect(readPreparedArticleKey(new Event("dashboard"))).toBeNull();
    expect(
      readPreparedArticleKey(
        new CustomEvent("dashboard", { detail: { articleKey: "article-1" } }),
      ),
    ).toBe("article-1");
    expect(
      readPreparedArticleKey(
        new CustomEvent("dashboard", { detail: { articleKey: 1 } }),
      ),
    ).toBeNull();

    expect(
      shouldAutoAnchorInvertedScrollViewport({
        expandedArticleKey: null,
        hasClaimedInvertedScrollOwnership: false,
        isInvertedScroll: true,
        isUnderfilledInvertedViewport: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoAnchorInvertedScrollViewport({
        expandedArticleKey: "article-1",
        hasClaimedInvertedScrollOwnership: false,
        isInvertedScroll: true,
        isUnderfilledInvertedViewport: true,
      }),
    ).toBe(false);
  });

  test("observe the expansion scroll lock using the current header anchor", () => {
    const observedTargets: Element[] = [];
    const disconnectResize = () => {};
    const disconnectMutation = () => {};
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalMutationObserver = globalThis.MutationObserver;

    class ResizeObserverMock {
      constructor(private readonly callback: ResizeObserverCallback) {}

      disconnect() {
        disconnectResize();
      }

      observe(target: Element) {
        observedTargets.push(target);
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    class MutationObserverMock {
      constructor(private readonly callback: MutationCallback) {
        this.callback = callback;
      }

      disconnect() {
        disconnectMutation();
      }

      observe() {}
    }

    try {
      globalThis.ResizeObserver =
        ResizeObserverMock as unknown as typeof ResizeObserver;
      globalThis.MutationObserver =
        MutationObserverMock as unknown as typeof MutationObserver;

      const viewport = document.createElement("div");
      viewport.dataset.radixScrollAreaViewport = "";
      const article = appendArticle(viewport, "article-1", 120);
      document.body.append(viewport);

      const stop = observeInvertedExpansionScrollLockLayout({
        articleKey: "article-1",
        onLayoutChange: () => {},
        viewport,
      });

      expect(observedTargets).toContain(viewport);
      expect(observedTargets).toContain(article.headerElement);

      stop();
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
      globalThis.MutationObserver = originalMutationObserver;
    }
  });
});
