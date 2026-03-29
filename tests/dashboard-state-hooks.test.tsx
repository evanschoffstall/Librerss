import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { ALL_FEEDS_NODE_KEY, DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import {
  useLockDocumentScroll,
  useRevealSidebarOnMount,
} from "@/app/dashboard/hooks/useDashboardEffects";
import { useDashboardEvents } from "@/app/dashboard/hooks/useDashboardEvents";
import { useDashboardHandlers } from "@/app/dashboard/hooks/useDashboardHandlers";
import { useDashboardState } from "@/app/dashboard/hooks/useDashboardState";
import { ArticleService, type CategoryTreeNode } from "@/lib";
import { READING_LIST_STREAM } from "@/lib/core/stream-ids";

const originalMarkAllRead = ArticleService.markAllRead;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalFeedCacheTtlMinutes = process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES =
    originalFeedCacheTtlMinutes ?? "15";
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = mock(() => {}) as typeof window.cancelAnimationFrame;
  ArticleService.markAllRead = mock(async () => {}) as typeof ArticleService.markAllRead;
});

afterEach(() => {
  mock.restore();
  ArticleService.markAllRead = originalMarkAllRead;
  if (originalFeedCacheTtlMinutes === undefined) {
    delete process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES;
  } else {
    process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES = originalFeedCacheTtlMinutes;
  }
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

describe("useDashboardState", () => {
  test("initializes the default dashboard state buckets and refs", () => {
    const { result } = renderHook(() => useDashboardState());

    expect(result.current.selectedCategory).toBe(ALL_FEEDS_NODE_KEY);
    expect(result.current.articleFilter).toBe("unread");
    expect(result.current.showFavicons).toBe(true);
    expect(result.current.searchTerm).toBe("");
    expect(result.current.expandedArticleKey).toBeNull();
    expect(result.current.showSettingsModal).toBe(false);
    expect(result.current.isMobileSidebarOpen).toBe(false);
    expect(result.current.feed).toEqual([]);
    expect(result.current.categoriesRef.current).toEqual(result.current.categories);
    expect(result.current.feedRef.current).toEqual(result.current.feed);
    expect(result.current.autoRefreshIntervalMinutes).toBeGreaterThanOrEqual(5);
  });

  test("normalizes auto-refresh updates from both values and updater functions", () => {
    const { result } = renderHook(() => useDashboardState());

    act(() => {
      result.current.setAutoRefreshIntervalMinutes(1);
    });

    expect(result.current.autoRefreshIntervalMinutes).toBeGreaterThanOrEqual(5);

    act(() => {
      result.current.setAutoRefreshIntervalMinutes((current) => current + 13);
    });

    expect(result.current.autoRefreshIntervalMinutes).toBeGreaterThanOrEqual(15);
    expect(result.current.categoriesRef.current).toEqual(result.current.categories);
    expect(result.current.feedRef.current).toEqual(result.current.feed);
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
      skipRefresh: undefined,
    });
    expect(fetchAllFeeds).toHaveBeenCalledWith(undefined, {
      forceRefresh: false,
      keepExistingFeed: true,
      requestSource: "auto-refresh",
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
    });
    expect(prefetchCategoryFeeds).toHaveBeenCalledWith(categoryNode, {
      requestSource: "sidebar-category-prefetch",
    });
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/feed-1.xml", {
      requestSource: "sidebar-feed-select",
    });
    expect(prefetchFeed).toHaveBeenCalledWith("https://example.com/feed-1.xml", {
      requestSource: "sidebar-feed-prefetch",
    });
  });
});

describe("useDashboardEvents", () => {
  test("dispatches placeholder-mode events without calling the API mark-all-read endpoint", async () => {
    const onMarkAllReadLocally = mock(() => {});
    const onMarkViewportRead = mock(async () => {});
    const onOpenFeedsSidebar = mock(() => {});
    const onOpenSettings = mock(() => {});
    const onRefresh = mock(async () => {});
    const onSearchChange = mock(() => {});

    renderHook(() =>
      useDashboardEvents({
        onMarkAllReadLocally,
        onMarkViewportRead,
        onOpenFeedsSidebar,
        onOpenSettings,
        onRefresh,
        onSearchChange,
        selectedCategory: ALL_FEEDS_NODE_KEY,
        selectedCategoryNode: undefined,
        selectedFeedUrl: undefined,
        usePlaceholderData: true,
      }),
    );

    const starts: string[] = [];
    const ends: string[] = [];
    window.addEventListener(DASHBOARD_EVENTS.MARK_ALL_READ_START, () => {
      starts.push("all");
    });
    window.addEventListener(DASHBOARD_EVENTS.MARK_ALL_READ_END, () => {
      ends.push("all");
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ));
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ));
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH));
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.SEARCH_CHANGE, {
          detail: { term: "mars" },
        }),
      );
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.OPEN_SETTINGS));
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR));
    });

    await waitFor(() => {
      expect(onMarkAllReadLocally).toHaveBeenCalled();
      expect(onMarkViewportRead).toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();
      expect(onSearchChange).toHaveBeenCalledWith("mars");
    });

    expect(onOpenSettings).toHaveBeenCalled();
    expect(onOpenFeedsSidebar).toHaveBeenCalled();
    expect(ArticleService.markAllRead).not.toHaveBeenCalled();
    expect(starts).toEqual(["all"]);
    expect(ends).toEqual(["all"]);
  });

  test("marks all read for the selected feed stream and refreshes afterward", async () => {
    const onRefresh = mock(async () => {});

    renderHook(() =>
      useDashboardEvents({
        onMarkViewportRead: mock(async () => {}),
        onOpenFeedsSidebar: mock(() => {}),
        onOpenSettings: mock(() => {}),
        onRefresh,
        onSearchChange: mock(() => {}),
        selectedCategory: "feed-1",
        selectedCategoryNode: createCategoryNode("News", "cat-news", [
          createFeedNode("Feed A", "feed-a", true),
        ]),
        selectedFeedUrl: "https://example.com/feed.xml",
        usePlaceholderData: false,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ));
    });

    await waitFor(() => {
      expect(ArticleService.markAllRead).toHaveBeenCalledWith(
        "feed/https://example.com/feed.xml",
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  test("marks all feeds read for the synthetic all-feeds selection", async () => {
    renderHook(() =>
      useDashboardEvents({
        onMarkViewportRead: mock(async () => {}),
        onOpenFeedsSidebar: mock(() => {}),
        onOpenSettings: mock(() => {}),
        onRefresh: mock(async () => {}),
        onSearchChange: mock(() => {}),
        selectedCategory: ALL_FEEDS_NODE_KEY,
        selectedCategoryNode: undefined,
        selectedFeedUrl: undefined,
        usePlaceholderData: false,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ));
    });

    await waitFor(() => {
      expect(ArticleService.markAllRead).toHaveBeenCalledWith(READING_LIST_STREAM);
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

function createFeedNode(label: string, key: string, enabled: boolean): CategoryTreeNode {
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