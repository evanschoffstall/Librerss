import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { toast } from "sonner";

import type { CategoryTreeNode } from "@/lib/core";

import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/constants";
import { FeedService } from "@/lib/api";

const originalDateNow = Date.now;
const originalClearTimeout = globalThis.clearTimeout;
const originalSetTimeout = globalThis.setTimeout;
const originalClearInterval = window.clearInterval;
const originalSetInterval = window.setInterval;
const originalConsoleError = console.error;
const originalToastDismiss = toast.dismiss;
const originalToastError = toast.error;
const originalToastSuccess = toast.success;
const originalCreateFeedSource = FeedService.createFeedSource;
const originalDeleteFeedSource = FeedService.deleteFeedSource;
const originalRenameFeedSource = FeedService.renameFeedSource;
const originalSetFeedSourceEnabled = FeedService.setFeedSourceEnabled;
const originalUpdateFeedSettings = FeedService.updateFeedSettings;
let originalDocumentHiddenDescriptor: PropertyDescriptor | undefined;

function makeFeedSourceResponse() {
  return {
    category: "News",
    enabled: true,
    id: 1,
    name: "Example Feed",
    url: "https://example.com/feed.xml",
  };
}

beforeEach(() => {
  mock.restore();
  console.error = (() => {}) as typeof console.error;
  toast.dismiss = mock(() => undefined) as typeof toast.dismiss;
  toast.error = mock(() => "") as typeof toast.error;
  toast.success = mock(() => "") as typeof toast.success;
  FeedService.createFeedSource = mock(async () =>
    makeFeedSourceResponse(),
  ) as unknown as typeof FeedService.createFeedSource;
  FeedService.deleteFeedSource = mock(async () =>
    makeFeedSourceResponse(),
  ) as unknown as typeof FeedService.deleteFeedSource;
  FeedService.renameFeedSource = mock(async () =>
    makeFeedSourceResponse(),
  ) as unknown as typeof FeedService.renameFeedSource;
  FeedService.setFeedSourceEnabled = mock(async () =>
    makeFeedSourceResponse(),
  ) as unknown as typeof FeedService.setFeedSourceEnabled;
  FeedService.updateFeedSettings = mock(async () =>
    makeFeedSourceResponse(),
  ) as unknown as typeof FeedService.updateFeedSettings;
});

afterEach(() => {
  mock.restore();
  Date.now = originalDateNow;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  window.setInterval = originalSetInterval;
  window.clearInterval = originalClearInterval;
  console.error = originalConsoleError;
  toast.dismiss = originalToastDismiss;
  toast.error = originalToastError;
  toast.success = originalToastSuccess;
  FeedService.createFeedSource = originalCreateFeedSource;
  FeedService.deleteFeedSource = originalDeleteFeedSource;
  FeedService.renameFeedSource = originalRenameFeedSource;
  FeedService.setFeedSourceEnabled = originalSetFeedSourceEnabled;
  FeedService.updateFeedSettings = originalUpdateFeedSettings;
  if (originalDocumentHiddenDescriptor) {
    Object.defineProperty(document, "hidden", originalDocumentHiddenDescriptor);
  }
  originalDocumentHiddenDescriptor = undefined;
});

describe("dashboard orchestration hooks", () => {
  test("useFeedSourceActions invokes feed-source wrappers without leaking module mocks", async () => {
    const modulePath = [
      "..",
      "src",
      "app",
      "dashboard",
      "dashboard-hooks",
      "category-tree",
      "useFeedSourceActions.ts",
    ].join("/");
    const { useFeedSourceActions } = (await import(
      `${modulePath}?dashboard-orchestration-feed-source-real`
    )) as typeof import("@/app/dashboard/dashboard-hooks/category-tree/useFeedSourceActions");
    const categories = [
      createCategoryNode("News", "cat-news", [
        createFeedNode({
          category: "News",
          key: "feed-1",
          label: "Example Feed",
          sourceId: 1,
          url: "https://example.com/feed.xml",
        }),
      ]),
    ];
    const fetchAllFeeds = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});
    const fetchFeed = mock(async () => {});
    const loadFeedSources = mock(async () => categories);
    const setCategories = mock(() => {});
    const setFeed = mock(() => {});
    const setSelectedCategory = mock(() => {});
    const setCustomCategoryLabels = mock(() => {});

    const { result } = renderHook(() =>
      useFeedSourceActions({
        categories,
        ensureCategoryLabelExists: mock(() => {}),
        fetchAllFeeds,
        fetchCategoryFeeds,
        fetchFeed,
        loadFeedSources,
        selectedCategory: ALL_FEEDS_NODE_KEY,
        setCategories,
        setFeed,
        setSelectedCategory,
      }),
    );

    await act(async () => {
      result.current.selectFeedByKey("feed-1");
      await result.current.addFeedSource("", "", "News");
      await result.current.removeFeedSource("missing");
      await result.current.renameFeedSource("missing", "", "");
      await result.current.moveFeedByDrop("missing", "", 2);
      await result.current.setFeedSourceEnabled("missing", true);
      await result.current.importOpmlFeeds([], {
        setCustomCategoryLabels,
      });
      await result.current.updateFeedSettings("missing", {
        extractionDisabled: true,
        proxyEnabled: true,
      });
    });

    expect(setSelectedCategory).toHaveBeenCalledWith("feed-1");
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/feed.xml");
    expect(loadFeedSources).not.toHaveBeenCalled();
    expect(fetchAllFeeds).not.toHaveBeenCalled();
    expect(fetchCategoryFeeds).not.toHaveBeenCalled();
    expect(setCategories).not.toHaveBeenCalled();
    expect(setFeed).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test("useCategoryCrudActions maintains ordered and custom labels through local updates", async () => {
    const modulePath = [
      "..",
      "src",
      "app",
      "dashboard",
      "dashboard-hooks",
      "useCategoryCrudActions.ts",
    ].join("/");
    const { useCategoryCrudActions } = (await import(
      `${modulePath}?dashboard-orchestration-category-crud-real`
    )) as typeof import("@/app/dashboard/dashboard-hooks/useCategoryCrudActions");
    const categories = [createCategoryNode("News", "cat-news")];
    const loadFeedSources = mock(async () => categories);
    const setCategories = mock(() => {});
    const setSelectedCategory = mock(() => {});
    let orderedCategoryLabels: string[] = [];
    const setOrderedCategoryLabels = mock(
      (value: React.SetStateAction<string[]>) => {
        orderedCategoryLabels =
          typeof value === "function" ? value(orderedCategoryLabels) : value;
      },
    );

    const { result } = renderHook(() =>
      useCategoryCrudActions({
        categories,
        loadFeedSources,
        selectedCategory: ALL_FEEDS_NODE_KEY,
        setCategories,
        setOrderedCategoryLabels,
        setSelectedCategory,
      }),
    );

    act(() => {
      result.current.ensureCategoryLabelExists("Tech");
      result.current.ensureCategoryLabelExists("News");
      result.current.addCategory("Science");
      result.current.moveCategoryByDrop("News", 0);
    });

    const renamed = await act(async () =>
      result.current.renameCategory("News", "News"),
    );
    const removed = await act(async () =>
      result.current.removeCategory("News"),
    );

    expect(result.current.customCategoryLabels).toEqual(["Tech", "Science"]);
    expect(orderedCategoryLabels).toEqual(["Tech"]);
    expect(renamed).toBe(false);
    expect(removed).toBe(true);
    expect(setCategories).toHaveBeenCalled();
    expect(setSelectedCategory).not.toHaveBeenCalled();
    expect(result.current.pendingCategoryRemovalLabel).toBeNull();
  });

  test("useDashboardCategoryTree wires category ordering and import callbacks together", async () => {
    const modulePath = [
      "..",
      "src",
      "app",
      "dashboard",
      "dashboard-hooks",
      "useDashboardCategoryTree.ts",
    ].join("/");
    const { useDashboardCategoryTree } = (await import(
      `${modulePath}?dashboard-orchestration-category-tree-real`
    )) as typeof import("@/app/dashboard/dashboard-hooks/useDashboardCategoryTree");
    const categories = [createCategoryNode("News", "cat-news")];
    const fetchAllFeeds = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});
    const fetchFeed = mock(async () => {});
    const loadFeedSources = mock(async () => categories);
    const setCategories = mock(() => {});
    const setFeed = mock(() => {});
    const setSelectedCategory = mock(() => {});

    const { result } = renderHook(() =>
      useDashboardCategoryTree({
        categories,
        fetchAllFeeds,
        fetchCategoryFeeds,
        fetchFeed,
        loadFeedSources,
        selectedCategory: ALL_FEEDS_NODE_KEY,
        setCategories,
        setFeed,
        setSelectedCategory,
        usePlaceholderData: true,
      }),
    );

    expect(result.current.orderedCategoryLabels).toEqual([]);
    expect(result.current.pendingCategoryRemovalLabel).toBeNull();

    act(() => {
      result.current.ensureCategoryLabelExists("Tech");
      result.current.addCategory("Science");
    });

    await act(async () => {
      await result.current.importOpmlFeeds([]);
    });

    expect(result.current.customCategoryLabels).toEqual(["Tech", "Science"]);
    expect(result.current.orderedCategoryLabels).toEqual(["Tech"]);
    expect(fetchAllFeeds).not.toHaveBeenCalled();
    expect(fetchCategoryFeeds).not.toHaveBeenCalled();
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(setCategories).not.toHaveBeenCalled();
    expect(setFeed).not.toHaveBeenCalled();
    expect(setSelectedCategory).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test("useDashboardIntervals drives relative ticks, refresh cadence, and stale-tab resumes", async () => {
    const modulePath = [
      "..",
      "src",
      "app",
      "dashboard",
      "dashboard-hooks",
      "useDashboardIntervals.ts",
    ].join("/");
    const { STALE_TAB_THRESHOLD_MS, useDashboardIntervals } = (await import(
      `${modulePath}?dashboard-orchestration-intervals-real`
    )) as typeof import("@/app/dashboard/dashboard-hooks/useDashboardIntervals");
    const intervalCallbacks = new Map<number, () => void>();
    const timeoutCallbacks = new Map<number, () => void>();
    const clearIntervalMock = mock((id: number) => {
      intervalCallbacks.delete(id);
    });
    const clearTimeoutMock = mock((id: number) => {
      timeoutCallbacks.delete(id);
    });
    let nextTimerId = 0;
    let now = 0;
    let hidden = false;
    let relativeRefreshTick = 0;

    originalDocumentHiddenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "hidden",
    );
    Date.now = () => now;
    window.setInterval = ((callback: TimerHandler) => {
      nextTimerId += 1;
      intervalCallbacks.set(nextTimerId, callback as () => void);
      return nextTimerId;
    }) as typeof window.setInterval;
    window.clearInterval = clearIntervalMock as typeof window.clearInterval;
    globalThis.setTimeout = ((callback: TimerHandler) => {
      nextTimerId += 1;
      timeoutCallbacks.set(nextTimerId, callback as () => void);
      return nextTimerId as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = clearTimeoutMock as typeof clearTimeout;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });

    const autoRefreshFeedList = mock(async () => {});
    const onStaleTabResume = mock(() => {});
    const setRelativeRefreshTick = mock(
      (value: React.SetStateAction<number>) => {
        relativeRefreshTick =
          typeof value === "function" ? value(relativeRefreshTick) : value;
      },
    );

    const { unmount } = renderHook(() =>
      useDashboardIntervals({
        autoRefreshFeedList,
        autoRefreshIntervalMinutes: 5,
        onStaleTabResume,
        setRelativeRefreshTick,
      }),
    );

    act(() => {
      intervalCallbacks.get(1)?.();
      now = 400_000;
      intervalCallbacks.get(2)?.();
    });

    expect(relativeRefreshTick).toBe(1);
    expect(autoRefreshFeedList).toHaveBeenCalledTimes(1);

    act(() => {
      hidden = true;
      now = 500_000;
      document.dispatchEvent(new Event("visibilitychange"));
      hidden = false;
      now = 900_000 + STALE_TAB_THRESHOLD_MS;
      document.dispatchEvent(new Event("visibilitychange"));
      Array.from(timeoutCallbacks.values()).at(-1)?.();
    });

    expect(toast.dismiss).toHaveBeenCalledTimes(1);
    expect(onStaleTabResume).toHaveBeenCalledTimes(1);
    expect(autoRefreshFeedList).toHaveBeenCalledTimes(1);

    unmount();

    expect(clearIntervalMock).toHaveBeenCalledTimes(2);
    expect(clearTimeoutMock).toHaveBeenCalled();
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

function createFeedNode(options: {
  category: string;
  key: string;
  label: string;
  sourceId: number;
  url: string;
}): CategoryTreeNode {
  return {
    data: {
      category: options.category,
      enabled: true,
      sourceId: options.sourceId,
      url: options.url,
    },
    key: options.key,
    label: options.label,
  };
}
