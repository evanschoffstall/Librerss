import { describe, expect, mock, test } from "bun:test";

import type { CategoryTreeNode } from "@/lib/core";

import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/constants";
import {
  initializeDashboardSelection,
  refreshCurrentSelection,
} from "@/app/dashboard/dashboard-services/selection";

/** Creates a promise whose resolution can be controlled by the test. */
function createDeferredPromise() {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve() {
      resolvePromise?.();
    },
  };
}

describe("initializeDashboardSelection", () => {
  test("releases sidebar loading after the initial feed fetch settles", async () => {
    const events: string[] = [];
    const deferredFetch = createDeferredPromise();
    const categories: CategoryTreeNode[] = [];

    const promise = initializeDashboardSelection({
      fetchAllFeeds: mock(async () => {
        events.push("fetch:start");
        await deferredFetch.promise;
        events.push("fetch:done");
      }),
      fetchCategoryFeeds: mock(async () => {}),
      fetchFeed: mock(async () => {}),
      loadFeedSources: mock(async () => {
        events.push("sources:done");
        return categories;
      }),
      selectedCategory: ALL_FEEDS_NODE_KEY,
      setIsCategoriesLoading: mock((value: boolean) => {
        events.push(`sidebar:${String(value)}`);
      }),
      setSelectedCategory: mock(() => {}),
    });

    await Promise.resolve();
    expect(events).toEqual(["sources:done", "fetch:start"]);

    deferredFetch.resolve();
    await promise;

    expect(events).toEqual([
      "sources:done",
      "fetch:start",
      "fetch:done",
      "sidebar:false",
    ]);
  });

  test("fetches the selected enabled feed during boot", async () => {
    const categories = [
      createCategory("News", [
        createFeed("feed-1", "https://example.com/feed.xml"),
      ]),
    ];
    const fetchFeed = mock(async () => {});
    const fetchAllFeeds = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});

    await initializeDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      loadFeedSources: mock(async () => categories),
      selectedCategory: "feed-1",
      setIsCategoriesLoading: mock(() => {}),
      setSelectedCategory: mock(() => {}),
    });

    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/feed.xml", {
      requestSource: "dashboard-initial-cache",
      skipRefresh: true,
    });
    expect(fetchAllFeeds).not.toHaveBeenCalled();
    expect(fetchCategoryFeeds).not.toHaveBeenCalled();
  });

  test("fetches the selected category when no feed is targeted", async () => {
    const category = createCategory("News", []);
    const fetchCategoryFeeds = mock(async () => {});

    await initializeDashboardSelection({
      fetchAllFeeds: mock(async () => {}),
      fetchCategoryFeeds,
      fetchFeed: mock(async () => {}),
      loadFeedSources: mock(async () => [category]),
      selectedCategory: category.key,
      setIsCategoriesLoading: mock(() => {}),
      setSelectedCategory: mock(() => {}),
    });

    expect(fetchCategoryFeeds).toHaveBeenCalledWith(category, {
      requestSource: "dashboard-initial-cache",
      skipRefresh: true,
    });
  });

  test("falls back to all feeds when the selection cannot be resolved", async () => {
    const categories = [createCategory("News", [])];
    const fetchAllFeeds = mock(async () => {});
    const setSelectedCategory = mock(() => {});

    await initializeDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds: mock(async () => {}),
      fetchFeed: mock(async () => {}),
      loadFeedSources: mock(async () => categories),
      selectedCategory: "missing-selection",
      setIsCategoriesLoading: mock(() => {}),
      setSelectedCategory,
    });

    expect(setSelectedCategory).toHaveBeenCalledWith(ALL_FEEDS_NODE_KEY);
    expect(fetchAllFeeds).toHaveBeenCalledWith(categories, {
      requestSource: "dashboard-initial-cache",
      skipRefresh: true,
    });
  });
});

describe("refreshCurrentSelection", () => {
  test("refreshes all feeds when the synthetic all-feeds node is selected", async () => {
    const fetchAllFeeds = mock(async () => {});

    await refreshCurrentSelection({
      fetchAllFeeds,
      fetchCategoryFeeds: mock(async () => {}),
      fetchFeed: mock(async () => {}),
      forceRefresh: true,
      keepExistingFeed: true,
      requestSource: "manual-refresh",
      selectedCategory: ALL_FEEDS_NODE_KEY,
      skipRefresh: true,
    });

    expect(fetchAllFeeds).toHaveBeenCalledWith(undefined, {
      forceRefresh: true,
      keepExistingFeed: true,
      requestSource: "manual-refresh",
      skipRefresh: true,
    });
  });

  test("refreshes the selected feed URL before any category fallback", async () => {
    const fetchFeed = mock(async () => {});
    const category = createCategory("News", []);

    await refreshCurrentSelection({
      fetchAllFeeds: mock(async () => {}),
      fetchCategoryFeeds: mock(async () => {}),
      fetchFeed,
      selectedCategory: "feed-1",
      selectedCategoryNode: category,
      selectedFeedUrl: "https://example.com/feed.xml",
    });

    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/feed.xml", {
      forceRefresh: false,
      keepExistingFeed: undefined,
      requestSource: undefined,
      skipRefresh: undefined,
    });
  });

  test("refreshes the selected category when only a category node is available", async () => {
    const fetchCategoryFeeds = mock(async () => {});
    const category = createCategory("News", []);

    await refreshCurrentSelection({
      fetchAllFeeds: mock(async () => {}),
      fetchCategoryFeeds,
      fetchFeed: mock(async () => {}),
      selectedCategory: category.key,
      selectedCategoryNode: category,
    });

    expect(fetchCategoryFeeds).toHaveBeenCalledWith(category, {
      forceRefresh: false,
      keepExistingFeed: undefined,
      requestSource: undefined,
      skipRefresh: undefined,
    });
  });

  test("falls back to the default feed URL when nothing else resolves", async () => {
    const fetchFeed = mock(async () => {});

    await refreshCurrentSelection({
      fetchAllFeeds: mock(async () => {}),
      fetchCategoryFeeds: mock(async () => {}),
      fetchFeed,
      selectedCategory: "missing",
    });

    expect(fetchFeed).toHaveBeenCalledWith(
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      {
        forceRefresh: false,
        keepExistingFeed: undefined,
        requestSource: undefined,
        skipRefresh: undefined,
      },
    );
  });
});

function createCategory(
  label: string,
  children: CategoryTreeNode[],
): CategoryTreeNode {
  return {
    children,
    key: `cat-${label.toLowerCase()}`,
    label,
  };
}

function createFeed(
  key: string,
  url: string,
  enabled = true,
): CategoryTreeNode {
  return {
    children: [],
    data: {
      enabled,
      url,
    },
    key,
    label: `Feed ${key}`,
  };
}
