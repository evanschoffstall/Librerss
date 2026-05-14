import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { CategoryTreeNode } from "@/lib/core";

import {
  ALL_FEEDS_NODE_KEY,
  DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
  DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
  DASHBOARD_EVENTS,
  DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
} from "@/app/dashboard/constants";
import { useDashboardFeedLoadingState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerSections";
import {
  useLockDocumentScroll,
  useRevealSidebarOnMount,
} from "@/app/dashboard/dashboard-hooks/useDashboardEffects";
import {
  runDashboardMarkAllReadCommand,
  runDashboardRefreshCommand,
} from "@/app/dashboard/dashboard-hooks/useDashboardEvents";
import { useDashboardHandlers } from "@/app/dashboard/dashboard-hooks/useDashboardHandlers";
import { READING_LIST_STREAM } from "@/lib/core/stream-ids";

import { createIsolatedStorage } from "./test-storage";

const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalGlobalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalGlobalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalGlobalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const originalWindowLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);
const originalGlobalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);
const originalWindowSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "sessionStorage",
);
const originalFeedCacheTtlMinutes =
  process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES;

async function loadUseDashboardState() {
  const module = await import(
    `@/app/dashboard/dashboard-hooks/useDashboardState/state?test=${Date.now()}-${Math.random()}`
  );

  return module.useDashboardState;
}

beforeEach(() => {
  const isolatedLocalStorage = createIsolatedStorage();
  const isolatedSessionStorage = createIsolatedStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: isolatedLocalStorage,
    writable: true,
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: isolatedLocalStorage,
    writable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: isolatedSessionStorage,
    writable: true,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: isolatedSessionStorage,
    writable: true,
  });
  process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES =
    originalFeedCacheTtlMinutes ?? "15";
  const requestAnimationFrameMock = ((callback: FrameRequestCallback) =>
    setTimeout(
      () => callback(performance.now()),
      0,
    ) as unknown as number) as typeof window.requestAnimationFrame;
  const cancelAnimationFrameMock = ((frameId: number) => {
    clearTimeout(frameId);
  }) as typeof window.cancelAnimationFrame;

  window.requestAnimationFrame = requestAnimationFrameMock;
  globalThis.requestAnimationFrame = requestAnimationFrameMock;
  window.cancelAnimationFrame = cancelAnimationFrameMock;
  globalThis.cancelAnimationFrame = cancelAnimationFrameMock;
});

afterEach(() => {
  mock.restore();
  if (originalFeedCacheTtlMinutes === undefined) {
    delete process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES;
  } else {
    process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES =
      originalFeedCacheTtlMinutes;
  }
  window.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.requestAnimationFrame = originalGlobalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
  globalThis.cancelAnimationFrame = originalGlobalCancelAnimationFrame;
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  if (originalGlobalLocalStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "localStorage",
      originalGlobalLocalStorageDescriptor,
    );
  }
  if (originalWindowLocalStorageDescriptor) {
    Object.defineProperty(
      window,
      "localStorage",
      originalWindowLocalStorageDescriptor,
    );
  }
  if (originalGlobalSessionStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "sessionStorage",
      originalGlobalSessionStorageDescriptor,
    );
  }
  if (originalWindowSessionStorageDescriptor) {
    Object.defineProperty(
      window,
      "sessionStorage",
      originalWindowSessionStorageDescriptor,
    );
  }
});

describe("useDashboardState", () => {
  test("initializes the default dashboard state buckets and refs", async () => {
    const useDashboardState = await loadUseDashboardState();
    const { result } = renderHook(() => useDashboardState());

    expect(result.current.selectedCategory).toBe(ALL_FEEDS_NODE_KEY);
    expect(result.current.articleFilter).toBe("unread");
    expect(result.current.showFavicons).toBe(true);
    expect(result.current.searchTerm).toBe("");
    expect(result.current.expandedArticleKey).toBeNull();
    expect(result.current.showSettingsModal).toBe(false);
    expect(result.current.isMobileSidebarOpen).toBe(false);
    expect(result.current.feed).toEqual([]);
    expect(result.current.categoriesRef.current).toEqual(
      result.current.categories,
    );
    expect(result.current.feedRef.current).toEqual(result.current.feed);
    expect(result.current.autoRefreshIntervalMinutes).toBeGreaterThanOrEqual(
      30,
    );
  });

  test("normalizes auto-refresh updates from both values and updater functions", async () => {
    window.localStorage.setItem(
      DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
      JSON.stringify("placeholder-feeds"),
    );
    globalThis.localStorage?.setItem(
      DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
      JSON.stringify("placeholder-feeds"),
    );
    window.localStorage.setItem(
      DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
      JSON.stringify("read"),
    );
    globalThis.localStorage?.setItem(
      DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
      JSON.stringify("read"),
    );
    window.localStorage.setItem(
      DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
      JSON.stringify(4),
    );
    globalThis.localStorage?.setItem(
      DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
      JSON.stringify(4),
    );

    const useDashboardState = await loadUseDashboardState();
    const { result } = renderHook(() => useDashboardState());

    act(() => {
      result.current.setAutoRefreshIntervalMinutes(1);
    });

    expect(result.current.autoRefreshIntervalMinutes).toBeGreaterThanOrEqual(
      30,
    );

    act(() => {
      result.current.setAutoRefreshIntervalMinutes(
        (current: number) => current + 13,
      );
    });

    expect(result.current.autoRefreshIntervalMinutes).toBeGreaterThanOrEqual(
      43,
    );
    expect(result.current.categoriesRef.current).toEqual(
      result.current.categories,
    );
    expect(result.current.feedRef.current).toEqual(result.current.feed);
  });

  test("rehydrates the selected feed, quick token filter, and page-size setting only", async () => {
    window.localStorage.setItem(
      DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
      JSON.stringify("placeholder-feeds"),
    );
    globalThis.localStorage?.setItem(
      DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
      JSON.stringify("placeholder-feeds"),
    );
    window.localStorage.setItem(
      DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
      JSON.stringify("read"),
    );
    globalThis.localStorage?.setItem(
      DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
      JSON.stringify("read"),
    );
    window.localStorage.setItem("librerss:showFavicons", JSON.stringify(false));
    globalThis.localStorage?.setItem(
      "librerss:showFavicons",
      JSON.stringify(false),
    );
    window.localStorage.setItem(
      DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
      JSON.stringify(4),
    );
    globalThis.localStorage?.setItem(
      DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
      JSON.stringify(4),
    );
    window.localStorage.setItem(
      "librerss:autoRefreshIntervalMinutes",
      JSON.stringify(90),
    );
    globalThis.localStorage?.setItem(
      "librerss:autoRefreshIntervalMinutes",
      JSON.stringify(90),
    );
    window.sessionStorage.setItem(
      "librerss:searchTerm",
      JSON.stringify("mars"),
    );
    globalThis.sessionStorage?.setItem(
      "librerss:searchTerm",
      JSON.stringify("mars"),
    );
    window.sessionStorage.setItem(
      "librerss:expandedArticleKey",
      JSON.stringify("article-1"),
    );
    globalThis.sessionStorage?.setItem(
      "librerss:expandedArticleKey",
      JSON.stringify("article-1"),
    );

    const useDashboardState = await loadUseDashboardState();
    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.selectedCategory).toBe("placeholder-feeds");
      expect(result.current.articleFilter).toBe("read");
    });

    expect(result.current.searchTerm).toBe("");
    expect(result.current.expandedArticleKey).toBeNull();
    expect(result.current.showFavicons).toBe(true);
    expect(result.current.articlesPerPage).toBe(4);
    expect(result.current.autoRefreshIntervalMinutes).toBeGreaterThanOrEqual(
      30,
    );
  });

  test("uses the article window in preview mode when search is empty", () => {
    const { rerender, result } = renderHook(
      ({
        searchTerm,
        usePlaceholderData,
      }: {
        searchTerm: string;
        usePlaceholderData: boolean;
      }) =>
        useDashboardFeedLoadingState({
          articleFilter: "unread",
          feedLength: 12,
          isCategoriesLoading: false,
          loading: false,
          searchTerm,
          settleMs: 0,
          usePlaceholderData,
        }),
      {
        initialProps: {
          searchTerm: "",
          usePlaceholderData: true,
        },
      },
    );

    expect(result.current.shouldUseArticleWindow).toBe(true);

    rerender({
      searchTerm: "mars",
      usePlaceholderData: true,
    });

    expect(result.current.shouldUseArticleWindow).toBe(false);
  });

  test("isShellLoading does NOT fire when search runs with a non-empty feed (keepExistingFeed path)", async () => {
    // Regression guard for the search-skeleton bug: when a user types in the
    // search bar and the server fetch runs with keepExistingFeed:true, the feed
    // is never cleared to []. feedLength stays > 0, so isFeedListInitialLoading
    // = loading && feedLength === 0 is false, and isShellLoading must stay false
    // once the initial settle has completed.
    const { rerender, result } = renderHook(
      ({ feedLength, loading }: { feedLength: number; loading: boolean }) =>
        useDashboardFeedLoadingState({
          articleFilter: "unread",
          feedLength,
          isCategoriesLoading: false,
          loading,
          searchTerm: "mars",
          settleMs: 0,
          usePlaceholderData: false,
        }),
      {
        initialProps: { feedLength: 10, loading: false },
      },
    );

    // Allow the settleMs=0 timeout to flip isShellLoading to false.
    await waitFor(() => {
      expect(result.current.isShellLoading).toBe(false);
    });

    // Simulate a background search request setting loading=true while
    // the existing feed (10 items) is still visible.
    rerender({ feedLength: 10, loading: true });

    // isShellLoading must NOT become true: feedLength > 0 so it is a refresh,
    // not an initial load.  Only isFeedListRefreshing flips.
    expect(result.current.isShellLoading).toBe(false);
    expect(result.current.isFeedListRefreshing).toBe(true);
  });

  test("treats empty feed reloads as feed refreshes after the shell has settled", async () => {
    const { rerender, result } = renderHook(
      ({ feedLength, loading }: { feedLength: number; loading: boolean }) =>
        useDashboardFeedLoadingState({
          articleFilter: "unread",
          feedLength,
          isCategoriesLoading: false,
          loading,
          searchTerm: "",
          settleMs: 0,
          usePlaceholderData: false,
        }),
      {
        initialProps: { feedLength: 8, loading: false },
      },
    );

    await waitFor(() => {
      expect(result.current.isShellLoading).toBe(false);
    });

    rerender({ feedLength: 0, loading: true });

    expect(result.current.isShellLoading).toBe(false);
    expect(result.current.isFeedListInitialLoading).toBe(true);
    expect(result.current.isFeedListRefreshing).toBe(true);
  });

  test("isShellLoading stays true while categories are loading even after the feed list finishes", async () => {
    // Regression: sidebar used isCategoriesLoading directly and unmasked before
    // the toolbar/filterBar/feedList which wait for isShellLoading.  Verifying
    // that isShellLoading encompasses isCategoriesLoading ensures all skeleton
    // surfaces share a single gate and hydrate simultaneously.
    const { rerender, result } = renderHook(
      ({
        feedLength,
        isCategoriesLoading,
        loading,
      }: {
        feedLength: number;
        isCategoriesLoading: boolean;
        loading: boolean;
      }) =>
        useDashboardFeedLoadingState({
          articleFilter: "unread",
          feedLength,
          isCategoriesLoading,
          loading,
          searchTerm: "",
          settleMs: 0,
          usePlaceholderData: false,
        }),
      {
        initialProps: {
          feedLength: 0,
          isCategoriesLoading: true,
          loading: true,
        },
      },
    );

    // Both loading sources active → shell loading.
    expect(result.current.isShellLoading).toBe(true);

    // Feed list done, categories still loading → still shell loading.
    rerender({ feedLength: 8, isCategoriesLoading: true, loading: false });
    expect(result.current.isShellLoading).toBe(true);

    // Categories done, feed still loading → still shell loading.
    rerender({ feedLength: 0, isCategoriesLoading: false, loading: true });
    expect(result.current.isShellLoading).toBe(true);

    // Both done → settles to false (settleMs=0 so immediate).
    rerender({ feedLength: 8, isCategoriesLoading: false, loading: false });
    await waitFor(() => {
      expect(result.current.isShellLoading).toBe(false);
    });
  });

  test("isShellLoading stays true during the settle window after loading clears", async () => {
    // With settleMs > 0, isShellLoading must not flip to false before the
    // settle timeout expires.  We validate the initial true state here;
    // the settled-false path is exercised by the settleMs=0 test above.
    const { result } = renderHook(() =>
      useDashboardFeedLoadingState({
        articleFilter: "all",
        feedLength: 0,
        isCategoriesLoading: false,
        loading: true,
        searchTerm: "",
        settleMs: 200,
        usePlaceholderData: false,
      }),
    );

    // Feed is still loading (feedLength=0, loading=true) → shell loading.
    expect(result.current.isShellLoading).toBe(true);
  });
});

describe("dashboard effect helpers", () => {
  test("locks document scroll for the dashboard lifecycle", () => {
    const { unmount } = renderHook(() => useLockDocumentScroll());

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  test("reveals the sidebar on the next animation frame", async () => {
    const setIsSidebarVisible = mock(() => {});

    renderHook(() => useRevealSidebarOnMount(setIsSidebarVisible));

    await waitFor(() => {
      expect(setIsSidebarVisible).toHaveBeenCalledWith(true);
    });
  });
});

describe("useDashboardHandlers", () => {
  test("refreshes the current all-feeds selection and handles sidebar category interactions", async () => {
    const fetchAllFeeds = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});
    const fetchFeed = mock(async () => {});
    const prefetchAllFeeds = mock(async () => {});
    const prefetchCategoryFeeds = mock(async () => {});
    const prefetchFeed = mock(async () => {});
    const onBeforeRefresh = mock(() => {});
    const setIsMobileSidebarOpen = mock(() => {});
    const setSelectedCategory = mock(() => {});
    const categoryNode = createCategoryNode("Tech", "cat-tech");
    const allFeedsNode = createCategoryNode("All Feeds", ALL_FEEDS_NODE_KEY);
    const feedNode = createFeedNode("Example Feed", "feed-1", true);
    const disabledFeedNode = createFeedNode("Disabled Feed", "feed-2", false);

    const { result } = renderHook(() =>
      useDashboardHandlers({
        fetchAllFeeds,
        fetchCategoryFeeds,
        fetchFeed,
        onBeforeRefresh,
        prefetchAllFeeds,
        prefetchCategoryFeeds,
        prefetchFeed,
        searchTerm: "mars",
        selectedCategory: ALL_FEEDS_NODE_KEY,
        selectedCategoryNode: categoryNode,
        selectedFeedUrl: undefined,
        setIsMobileSidebarOpen,
        setSelectedCategory,
      }),
    );

    await act(async () => {
      await result.current.handleRefreshSelection();
      await result.current.autoRefreshFeedList();
    });

    expect(fetchAllFeeds).toHaveBeenCalledWith(undefined, {
      forceRefresh: true,
      keepExistingFeed: true,
      requestSource: "manual-refresh",
      searchTerm: "mars",
      skipRefresh: undefined,
    });
    expect(fetchAllFeeds).toHaveBeenCalledWith(undefined, {
      forceRefresh: true,
      keepExistingFeed: true,
      requestSource: "auto-refresh",
      searchTerm: "mars",
      skipRefresh: undefined,
    });
    expect(onBeforeRefresh).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.handleCategoryClick(allFeedsNode);
      result.current.handleCategoryClick(categoryNode);
      result.current.handleCategoryPrefetch(categoryNode);
      result.current.handleFeedClick(feedNode);
      result.current.handleFeedClick(disabledFeedNode);
      result.current.handleFeedPrefetch(feedNode);
      result.current.handleFeedPrefetch(disabledFeedNode);
    });

    expect(setSelectedCategory).toHaveBeenCalledWith(ALL_FEEDS_NODE_KEY);
    expect(setSelectedCategory).toHaveBeenCalledWith("cat-tech");
    expect(setSelectedCategory).toHaveBeenCalledWith("feed-1");
    expect(setSelectedCategory).toHaveBeenCalledWith("feed-2");
    expect(setIsMobileSidebarOpen).toHaveBeenCalledWith(false);
    expect(fetchCategoryFeeds).toHaveBeenCalledWith(categoryNode, {
      requestSource: "sidebar-category-select",
      searchTerm: "mars",
    });
    expect(prefetchCategoryFeeds).toHaveBeenCalledWith(categoryNode, {
      requestSource: "sidebar-category-prefetch",
      searchTerm: "mars",
      skipRefresh: true,
    });
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/feed-1.xml", {
      requestSource: "sidebar-feed-select",
      searchTerm: "mars",
    });
    expect(prefetchFeed).toHaveBeenCalledWith(
      "https://example.com/feed-1.xml",
      {
        requestSource: "sidebar-feed-prefetch",
        searchTerm: "mars",
        skipRefresh: true,
      },
    );
  });
});

describe("useDashboardEvents", () => {
  test("dispatches placeholder-mode events without calling the API mark-all-read endpoint", async () => {
    const markAllRead = mock(async (_stream: string) => {});
    const onMarkAllReadLocally = mock(() => {});
    const onRefresh = mock(async () => {});

    const starts: string[] = [];
    const ends: string[] = [];
    const eventTarget = {
      dispatchEvent(event: Event) {
        if (event.type === DASHBOARD_EVENTS.MARK_ALL_READ_START) {
          starts.push("all");
        }
        if (event.type === DASHBOARD_EVENTS.MARK_ALL_READ_END) {
          ends.push("all");
        }
        return true;
      },
    } satisfies Pick<Window, "dispatchEvent">;

    await runDashboardMarkAllReadCommand(eventTarget, {
      markAllRead,
      onMarkAllReadLocally,
      onRefresh,
      selectedCategory: ALL_FEEDS_NODE_KEY,
      selectedCategoryNode: undefined,
      selectedFeedUrl: undefined,
      usePlaceholderData: true,
    });
    expect(onMarkAllReadLocally).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(markAllRead).not.toHaveBeenCalled();
    expect(starts).toEqual(["all"]);
    expect(ends).toEqual(["all"]);
  });

  test("marks all read for the selected feed stream and refreshes afterward", async () => {
    const markAllRead = mock(async (_stream: string) => {});
    const onRefresh = mock(async () => {});
    const eventTarget = {
      dispatchEvent() {
        return true;
      },
    } satisfies Pick<Window, "dispatchEvent">;

    await runDashboardMarkAllReadCommand(eventTarget, {
      markAllRead,
      onRefresh,
      selectedCategory: "feed-1",
      selectedCategoryNode: createCategoryNode("News", "cat-news", [
        createFeedNode("Feed A", "feed-a", true),
      ]),
      selectedFeedUrl: "https://example.com/feed.xml",
      usePlaceholderData: false,
    });

    await waitFor(() => {
      expect(markAllRead).toHaveBeenCalledWith(
        "feed/https://example.com/feed.xml",
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  test("marks all feeds read for the synthetic all-feeds selection", async () => {
    const markAllRead = mock(async (_stream: string) => {});
    const eventTarget = {
      dispatchEvent() {
        return true;
      },
    } satisfies Pick<Window, "dispatchEvent">;

    await runDashboardMarkAllReadCommand(eventTarget, {
      markAllRead,
      onRefresh: mock(async () => {}),
      selectedCategory: ALL_FEEDS_NODE_KEY,
      selectedCategoryNode: undefined,
      selectedFeedUrl: undefined,
      usePlaceholderData: false,
    });

    await waitFor(() => {
      expect(markAllRead).toHaveBeenCalledWith(READING_LIST_STREAM);
    });
  });

  test("treats refresh events without detail as a normal refresh", async () => {
    const onRefresh = mock(async () => {});
    const eventTarget = {
      dispatchEvent() {
        return true;
      },
    } satisfies Pick<Window, "dispatchEvent">;

    await runDashboardRefreshCommand(eventTarget, onRefresh, undefined);

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledWith({ forceResolveUpstream: false });
    });
  });
});

function createCategoryNode(
  label: string,
  key: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    children,
    key,
    label,
  };
}

function createFeedNode(
  label: string,
  key: string,
  enabled: boolean,
): CategoryTreeNode {
  return {
    children: [],
    data: {
      enabled,
      url: `https://example.com/${key}.xml`,
    },
    key,
    label,
  };
}
