import { describe, expect, test } from "bun:test";

import type { Article, CategoryTreeNode, FeedSource } from "@/lib";

import {
  ALL_FEEDS_LABEL,
  ALL_FEEDS_NODE_KEY,
  DEFAULT_FEED_URL,
  INITIAL_CATEGORIES,
} from "@/app/dashboard/constants";
import {
  getCategoryRemovalTarget,
  removeCategoryFromLabelCollections,
  removeCategoryFromLocalState,
  restoreSelectedCategoryFromSourceUrl,
  updateCategoryLabelCollections,
} from "@/app/dashboard/services/category-operation-state";
import {
  buildCategoriesFromSources,
  buildDefaultCategories,
  collectKnownCategoryLabels,
  findFeedNodeByKey,
  findFeedNodeByUrl,
  getAllFeedNodes,
  getFeedUrlBySelectedKey,
  getFirstFeedNode,
  hasCategoryLabelInTree,
  relocateFeedInCategories,
  SYSTEM_ALL_FEEDS_CATEGORY,
  toCategoryKey,
  toDistinctCategoryLabels,
} from "@/app/dashboard/services/category-tree";
import {
  autoRefreshDashboardSelection,
  prefetchDashboardCategory,
  prefetchDashboardFeed,
  refreshDashboardSelection,
  selectDashboardCategory,
  selectDashboardFeed,
} from "@/app/dashboard/services/dashboard-refresh-requests";
import {
  classifyFeedBatchError,
  formatLastRefreshLabel,
  getNewestLastFetchedAt,
  getSourceNamesByUrl,
  isCanceledBatchRequest,
  mergeHydratedContent,
  resolveExpandedArticleKey,
  summarizeBatchResults,
} from "@/app/dashboard/services/feed-loader-helpers";
import {
  type FeedFetchOptions,
  initializeDashboardSelection,
  refreshCurrentSelection,
} from "@/app/dashboard/services/selection";
import { PLACEHOLDER_CATEGORY } from "@/lib/core/placeholder";

describe("dashboard selection and tree coverage", () => {
  test("covers category tree construction and lookup helpers", () => {
    const sources: FeedSource[] = [
      {
        category: " News ",
        enabled: true,
        extractionDisabled: false,
        id: 1,
        name: "Feed One",
        proxyEnabled: false,
        url: "https://example.com/feed-1.xml",
      },
      {
        category: "uncategorized",
        enabled: false,
        extractionDisabled: true,
        id: 2,
        name: "Feed Two",
        proxyEnabled: true,
        url: "https://example.com/feed-2.xml",
      },
    ];

    const categories = buildCategoriesFromSources(sources);

    expect(toCategoryKey("  News & Research  ")).toBe("cat-news-research");
    expect(toCategoryKey("!!!")).toBe("cat-default");
    expect(categories).toEqual([
      {
        children: [
          {
            data: {
              category: "News",
              enabled: true,
              extractionDisabled: false,
              proxyEnabled: false,
              sourceId: 1,
              url: "https://example.com/feed-1.xml",
            },
            key: "cat-news-1",
            label: "Feed One",
          },
        ],
        key: "cat-news",
        label: "News",
      },
      {
        children: [
          {
            data: {
              category: "My Feeds",
              enabled: false,
              extractionDisabled: true,
              proxyEnabled: true,
              sourceId: 2,
              url: "https://example.com/feed-2.xml",
            },
            key: "cat-my-feeds-2",
            label: "Feed Two",
          },
        ],
        key: "cat-my-feeds",
        label: "My Feeds",
      },
    ]);
    expect(buildDefaultCategories(false)).toBe(INITIAL_CATEGORIES);
    expect(buildDefaultCategories(true)[0]?.label).toBe(PLACEHOLDER_CATEGORY);
    expect(SYSTEM_ALL_FEEDS_CATEGORY).toEqual({
      children: [],
      data: { url: "" },
      key: ALL_FEEDS_NODE_KEY,
      label: ALL_FEEDS_LABEL,
    });
    expect(collectKnownCategoryLabels(categories, ["Opinion"])).toEqual([
      "News",
      "My Feeds",
      "Opinion",
    ]);
    expect(findFeedNodeByKey(categories, "cat-news-1")?.label).toBe("Feed One");
    expect(findFeedNodeByUrl(categories, "https://example.com/feed-2.xml")?.label).toBe(
      "Feed Two",
    );
    expect(getAllFeedNodes(categories).map((node) => node.label)).toEqual([
      "Feed One",
      "Feed Two",
    ]);
    expect(getFeedUrlBySelectedKey(categories, "cat-news-1")).toBe(
      "https://example.com/feed-1.xml",
    );
    expect(getFirstFeedNode(categories)?.label).toBe("Feed One");
    expect(hasCategoryLabelInTree(categories, " news ")).toBe(true);
    expect(toDistinctCategoryLabels(["News", "news", "Science"])).toEqual([
      "News",
      "Science",
    ]);
  });

  test("covers category tree relocation logic", () => {
    const currentCategories = [
      {
        children: [
          buildFeedNode("Feed One", "feed-1", "https://example.com/feed-1.xml", "News"),
          buildFeedNode("Feed Two", "feed-2", "https://example.com/feed-2.xml", "News"),
        ],
        key: "cat-news",
        label: "News",
      },
      {
        children: [
          buildFeedNode(
            "Feed Three",
            "feed-3",
            "https://example.com/feed-3.xml",
            "Science",
          ),
        ],
        key: "cat-science",
        label: "Science",
      },
    ];

    expect(relocateFeedInCategories(currentCategories, "missing", "Science", 0)).toBe(
      currentCategories,
    );
    expect(
      relocateFeedInCategories(currentCategories, "feed-1", "News", 2)[0]?.children?.map(
        (node) => node.key,
      ),
    ).toEqual(["feed-2", "feed-1"]);
    expect(
      relocateFeedInCategories(currentCategories, "feed-1", "Opinion", 0),
    ).toEqual([
      {
        children: [
          buildFeedNode("Feed Two", "feed-2", "https://example.com/feed-2.xml", "News"),
        ],
        key: "cat-news",
        label: "News",
      },
      currentCategories[1],
      {
        children: [
          buildFeedNode(
            "Feed One",
            "feed-1",
            "https://example.com/feed-1.xml",
            "Opinion",
          ),
        ],
        key: "cat-opinion",
        label: "Opinion",
      },
    ]);
  });

  test("covers category operation state helpers", () => {
    const categories = [
      {
        children: [buildFeedNode("Feed One", "feed-1", "https://example.com/feed-1.xml", "News")],
        key: "cat-news",
        label: "News",
      },
      {
        children: [buildFeedNode("Feed Two", "feed-2", "https://example.com/feed-2.xml", "Science")],
        key: "cat-science",
        label: "Science",
      },
    ];
    let customLabels = ["News", "Opinion"];
    let orderedLabels = ["Opinion", "News", "Science"];
    let selectedCategory = "cat-news";

    const setCustomCategoryLabels = (update: ((labels: string[]) => string[]) | string[]) => {
      customLabels = typeof update === "function" ? update(customLabels) : update;
    };
    const setOrderedCategoryLabels = (update: ((labels: string[]) => string[]) | string[]) => {
      orderedLabels = typeof update === "function" ? update(orderedLabels) : update;
    };
    const setSelectedCategory = (update: ((value: string) => string) | string) => {
      selectedCategory = typeof update === "function" ? update(selectedCategory) : update;
    };

    expect(getCategoryRemovalTarget(categories, ["Opinion"], "News")).toBe("Science");
    expect(getCategoryRemovalTarget(categories, [], "News")).toBe("Science");
    expect(removeCategoryFromLocalState(categories, "Missing")).toBe(categories);
    expect(removeCategoryFromLocalState(categories, "News")).toEqual([categories[1]]);
    expect(removeCategoryFromLocalState(categories, "News", "Science")).toEqual([
      {
        children: [
          buildFeedNode("Feed Two", "feed-2", "https://example.com/feed-2.xml", "Science"),
          buildFeedNode("Feed One", "feed-1", "https://example.com/feed-1.xml", "Science"),
        ],
        key: "cat-science",
        label: "Science",
      },
    ]);
    expect(removeCategoryFromLocalState(categories, "News", "Opinion")).toEqual([
      categories[1],
      {
        children: [
          buildFeedNode("Feed One", "feed-1", "https://example.com/feed-1.xml", "Opinion"),
        ],
        key: "cat-opinion",
        label: "Opinion",
      },
    ]);

    updateCategoryLabelCollections(setCustomCategoryLabels, setOrderedCategoryLabels, (labels) => [
      ...labels,
      "Research",
    ]);
    expect(customLabels).toEqual(["News", "Opinion", "Research"]);
    expect(orderedLabels).toEqual(["Opinion", "News", "Science", "Research"]);

    removeCategoryFromLabelCollections(
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      "Opinion",
    );
    expect(customLabels).toEqual(["News", "Research"]);
    expect(orderedLabels).toEqual(["News", "Science", "Research"]);

    restoreSelectedCategoryFromSourceUrl({
      refreshedCategories: categories,
      selectedSourceUrl: "https://example.com/feed-2.xml",
      setSelectedCategory,
    });
    expect(selectedCategory).toBe("feed-2");
    restoreSelectedCategoryFromSourceUrl({
      refreshedCategories: categories,
      selectedSourceUrl: undefined,
      setSelectedCategory,
    });
    expect(selectedCategory).toBe("feed-2");
  });

  test("covers feed loader helper branches", () => {
    const now = Date.now();
    const previousFeed = [
      buildArticle({ content: "hydrated content", link: "https://example.com/kept" }),
      buildArticle({ content: "stale", link: "   " }),
    ];
    const freshArticles = [
      buildArticle({ content: "new content", link: "https://example.com/kept" }),
      buildArticle({ content: "plain content", link: "https://example.com/plain" }),
      buildArticle({ content: "blank link", link: "   " }),
    ];
    const batchResults = [
      { articles: [freshArticles[0]], lastFetchedAt: new Date(now - 30_000), ok: true, url: "https://example.com/a.xml" },
      { articles: [], error: "offline", lastFetchedAt: new Date(now - 120_000), ok: false, url: "https://example.com/b.xml" },
    ];

    expect(classifyFeedBatchError({ response: { status: 401 } })).toEqual({
      description: "Please sign in again to continue.",
      title: "Your session has expired.",
    });
    expect(classifyFeedBatchError({ response: { status: 429 } })).toEqual({
      description: "Please wait a moment before refreshing again.",
      title: "Too many requests.",
    });
    expect(classifyFeedBatchError({ code: "ECONNRESET" })).toEqual({
      description: "Check your connection and try again.",
      title: "Network error.",
    });
    expect(classifyFeedBatchError(new Error("Request timeout"))).toEqual({
      description: "The server took too long to respond. Try again shortly.",
      title: "Request timed out.",
    });
    expect(classifyFeedBatchError(new Error("Other"))).toEqual({
      description: "Please try refreshing the selected source again.",
      title: "Unable to load this feed right now.",
    });

    expect(formatLastRefreshLabel(null)).toBe("never");
    expect(formatLastRefreshLabel(new Date(now - 5_000))).toBe("just now");
    expect(formatLastRefreshLabel(new Date(now - 5 * 60_000))).toBe("5m ago");
    expect(formatLastRefreshLabel(new Date(now - 2 * 60 * 60_000))).toBe("2h ago");
    expect(formatLastRefreshLabel(new Date(now - 3 * 24 * 60 * 60_000))).toBe("3d ago");

    expect(getNewestLastFetchedAt(batchResults)).toEqual(batchResults[0]?.lastFetchedAt ?? null);
    expect(getSourceNamesByUrl([{ name: "Feed A", url: "https://example.com/a.xml" }]).get(
      "https://example.com/a.xml",
    )).toBe("Feed A");

    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    expect(isCanceledBatchRequest(abortError)).toBe(true);
    expect(isCanceledBatchRequest(new Error("nope"))).toBe(false);
    expect(mergeHydratedContent([], freshArticles)).toBe(freshArticles);
    expect(mergeHydratedContent(previousFeed, freshArticles)[0]?.content).toBe(
      "hydrated content",
    );
    expect(resolveExpandedArticleKey("https://example.com/kept", freshArticles)).toBe(
      "https://example.com/kept",
    );
    expect(resolveExpandedArticleKey("https://example.com/missing", freshArticles)).toBeNull();
    expect(resolveExpandedArticleKey(null, freshArticles)).toBeNull();
    expect(summarizeBatchResults(batchResults)).toEqual({
      articlesByUrl: [
        { articleCount: 1, error: null, ok: true, url: "https://example.com/a.xml" },
        { articleCount: 0, error: "offline", ok: false, url: "https://example.com/b.xml" },
      ],
      errorCount: 1,
      missingCount: 1,
      okCount: 1,
      resultCount: 2,
    });
  });

  test("covers selection initialization and refresh helpers", async () => {
    const categories = [
      {
        children: [buildFeedNode("Feed One", "feed-1", "https://example.com/feed-1.xml", "News")],
        key: "cat-news",
        label: "News",
      },
    ];
    const fetchCalls = createFetchRecorder();
    let isCategoriesLoading = true;
    let selectedCategory = ALL_FEEDS_NODE_KEY;

    await initializeDashboardSelection({
      ...fetchCalls.fetchers,
      loadFeedSources: async () => categories,
      selectedCategory,
      setIsCategoriesLoading: (value) => {
        isCategoriesLoading = value;
      },
      setSelectedCategory: (value) => {
        selectedCategory = value;
      },
    });
    expect(fetchCalls.allFeeds).toEqual([
      {
        categories,
        options: { requestSource: "dashboard-initial-cache", skipRefresh: true },
      },
    ]);
    expect(isCategoriesLoading).toBe(false);

    fetchCalls.reset();
    isCategoriesLoading = true;
    selectedCategory = "feed-1";
    await initializeDashboardSelection({
      ...fetchCalls.fetchers,
      loadFeedSources: async () => categories,
      selectedCategory,
      setIsCategoriesLoading: (value) => {
        isCategoriesLoading = value;
      },
      setSelectedCategory: (value) => {
        selectedCategory = value;
      },
    });
    expect(fetchCalls.feed).toEqual([
      {
        options: { requestSource: "dashboard-initial-cache", skipRefresh: true },
        url: "https://example.com/feed-1.xml",
      },
    ]);
    expect(isCategoriesLoading).toBe(false);

    fetchCalls.reset();
    selectedCategory = "cat-news";
    await initializeDashboardSelection({
      ...fetchCalls.fetchers,
      loadFeedSources: async () => categories,
      selectedCategory,
      setIsCategoriesLoading: () => {},
      setSelectedCategory: (value) => {
        selectedCategory = value;
      },
    });
    expect(fetchCalls.categoryFeeds).toEqual([
      {
        category: categories[0],
        options: { requestSource: "dashboard-initial-cache", skipRefresh: true },
      },
    ]);

    fetchCalls.reset();
    selectedCategory = "missing";
    await initializeDashboardSelection({
      ...fetchCalls.fetchers,
      loadFeedSources: async () => categories,
      selectedCategory,
      setIsCategoriesLoading: () => {},
      setSelectedCategory: (value) => {
        selectedCategory = value;
      },
    });
    expect(selectedCategory).toBe(ALL_FEEDS_NODE_KEY);
    expect(fetchCalls.allFeeds).toEqual([
      {
        categories,
        options: { requestSource: "dashboard-initial-cache", skipRefresh: true },
      },
    ]);

    fetchCalls.reset();
    await refreshCurrentSelection({
      ...fetchCalls.fetchers,
      selectedCategory: ALL_FEEDS_NODE_KEY,
    });
    await refreshCurrentSelection({
      ...fetchCalls.fetchers,
      forceRefresh: true,
      keepExistingFeed: true,
      requestSource: "manual-refresh",
      selectedCategory: "feed-1",
      selectedFeedUrl: "https://example.com/feed-1.xml",
    });
    await refreshCurrentSelection({
      ...fetchCalls.fetchers,
      selectedCategory: "cat-news",
      selectedCategoryNode: categories[0],
      skipRefresh: true,
    });
    await refreshCurrentSelection({
      ...fetchCalls.fetchers,
      selectedCategory: "missing",
    });
    expect(fetchCalls.allFeeds.at(0)).toEqual({
      categories: undefined,
      options: {
        forceRefresh: false,
        keepExistingFeed: undefined,
        requestSource: undefined,
        skipRefresh: undefined,
      },
    });
    expect(fetchCalls.feed.at(0)).toEqual({
      options: {
        forceRefresh: true,
        keepExistingFeed: true,
        requestSource: "manual-refresh",
        skipRefresh: undefined,
      },
      url: "https://example.com/feed-1.xml",
    });
    expect(fetchCalls.categoryFeeds.at(0)).toEqual({
      category: categories[0],
      options: {
        forceRefresh: false,
        keepExistingFeed: undefined,
        requestSource: undefined,
        skipRefresh: true,
      },
    });
    expect(fetchCalls.feed.at(1)).toEqual({
      options: {
        forceRefresh: false,
        keepExistingFeed: undefined,
        requestSource: undefined,
        skipRefresh: undefined,
      },
      url: DEFAULT_FEED_URL,
    });
  });

  test("covers dashboard refresh request wrappers and selection actions", async () => {
    const categoryNode: CategoryTreeNode = {
      children: [buildFeedNode("Feed One", "feed-1", "https://example.com/feed-1.xml", "News")],
      key: "cat-news",
      label: "News",
    };
    const feedNode = categoryNode.children?.[0] ?? buildFeedNode("Feed One", "feed-1", "https://example.com/feed-1.xml", "News");
    const fetchCalls = createFetchRecorder();
    const beforeRefreshCalls: string[] = [];
    const mobileSidebarStates: boolean[] = [];
    const selectedCategories: string[] = [];

    await autoRefreshDashboardSelection({
      ...fetchCalls.fetchers,
      onBeforeRefresh: () => {
        beforeRefreshCalls.push("auto");
      },
      selectedCategory: "feed-1",
      selectedFeedUrl: "https://example.com/feed-1.xml",
    });
    await refreshDashboardSelection({
      ...fetchCalls.fetchers,
      onBeforeRefresh: () => {
        beforeRefreshCalls.push("manual");
      },
      selectedCategory: "cat-news",
      selectedCategoryNode: categoryNode,
    });
    expect(beforeRefreshCalls).toEqual(["auto", "manual"]);

    prefetchDashboardCategory(categoryNode, {
      prefetchAllFeeds: fetchCalls.fetchers.fetchAllFeeds,
      prefetchCategoryFeeds: fetchCalls.fetchers.fetchCategoryFeeds,
      selectedCategory: "cat-other",
    });
    prefetchDashboardCategory(SYSTEM_ALL_FEEDS_CATEGORY, {
      prefetchAllFeeds: fetchCalls.fetchers.fetchAllFeeds,
      prefetchCategoryFeeds: fetchCalls.fetchers.fetchCategoryFeeds,
      selectedCategory: "cat-other",
    });
    prefetchDashboardCategory(categoryNode, {
      prefetchAllFeeds: fetchCalls.fetchers.fetchAllFeeds,
      prefetchCategoryFeeds: fetchCalls.fetchers.fetchCategoryFeeds,
      selectedCategory: "cat-news",
    });
    expect(fetchCalls.categoryFeeds.at(-1)).toEqual({
      category: categoryNode,
      options: { requestSource: "sidebar-category-prefetch" },
    });
    expect(fetchCalls.allFeeds.at(-1)).toEqual({
      categories: undefined,
      options: { requestSource: "sidebar-category-prefetch" },
    });

    prefetchDashboardFeed(feedNode, {
      prefetchFeed: fetchCalls.fetchers.fetchFeed,
      selectedCategory: "cat-other",
    });
    prefetchDashboardFeed(
      {
        ...feedNode,
        data: {
          category: feedNode.data?.category,
          enabled: false,
          url: feedNode.data?.url ?? "",
        },
      },
      {
      prefetchFeed: fetchCalls.fetchers.fetchFeed,
      selectedCategory: "cat-other",
      },
    );
    prefetchDashboardFeed(feedNode, {
      prefetchFeed: fetchCalls.fetchers.fetchFeed,
      selectedCategory: "feed-1",
    });
    expect(fetchCalls.feed.at(-1)).toEqual({
      options: { requestSource: "sidebar-feed-prefetch" },
      url: "https://example.com/feed-1.xml",
    });

    selectDashboardCategory(SYSTEM_ALL_FEEDS_CATEGORY, {
      fetchAllFeeds: fetchCalls.fetchers.fetchAllFeeds,
      fetchCategoryFeeds: fetchCalls.fetchers.fetchCategoryFeeds,
      setIsMobileSidebarOpen: (value) => {
        mobileSidebarStates.push(typeof value === "function" ? value(true) : value);
      },
      setSelectedCategory: (value) => {
        selectedCategories.push(typeof value === "function" ? value("current") : value);
      },
    });
    selectDashboardCategory(categoryNode, {
      fetchAllFeeds: fetchCalls.fetchers.fetchAllFeeds,
      fetchCategoryFeeds: fetchCalls.fetchers.fetchCategoryFeeds,
      setIsMobileSidebarOpen: (value) => {
        mobileSidebarStates.push(typeof value === "function" ? value(true) : value);
      },
      setSelectedCategory: (value) => {
        selectedCategories.push(typeof value === "function" ? value("current") : value);
      },
    });
    selectDashboardFeed(feedNode, {
      fetchFeed: fetchCalls.fetchers.fetchFeed,
      setIsMobileSidebarOpen: (value) => {
        mobileSidebarStates.push(typeof value === "function" ? value(true) : value);
      },
      setSelectedCategory: (value) => {
        selectedCategories.push(typeof value === "function" ? value("current") : value);
      },
    });
    selectDashboardFeed(
      {
        ...feedNode,
        data: {
          category: feedNode.data?.category,
          enabled: false,
          url: feedNode.data?.url ?? "",
        },
      },
      {
      fetchFeed: fetchCalls.fetchers.fetchFeed,
      setIsMobileSidebarOpen: (value) => {
        mobileSidebarStates.push(typeof value === "function" ? value(true) : value);
      },
      setSelectedCategory: (value) => {
        selectedCategories.push(typeof value === "function" ? value("current") : value);
      },
      },
    );

    expect(mobileSidebarStates).toEqual([false, false, false, false]);
    expect(selectedCategories).toEqual([
      ALL_FEEDS_NODE_KEY,
      "cat-news",
      "feed-1",
      "feed-1",
    ]);
    expect(fetchCalls.allFeeds.at(-1)).toEqual({
      categories: undefined,
      options: { requestSource: "sidebar-category-select" },
    });
    expect(fetchCalls.categoryFeeds.at(-1)).toEqual({
      category: categoryNode,
      options: { requestSource: "sidebar-category-select" },
    });
    expect(fetchCalls.feed.at(-1)).toEqual({
      options: { requestSource: "sidebar-feed-select" },
      url: "https://example.com/feed-1.xml",
    });
  });
});

function buildArticle(overrides?: Partial<Article>): Article {
  return {
    content: "Article body",
    feedId: 1,
    hasFullContent: true,
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date("2024-01-01T00:00:00.000Z"),
    link: "https://example.com/article",
    publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    title: "Example Article",
    ...overrides,
  };
}

function buildFeedNode(
  label: string,
  key: string,
  url: string,
  category: string,
): CategoryTreeNode {
  return {
    children: [],
    data: {
      category,
      enabled: true,
      url,
    },
    key,
    label,
  };
}

function createFetchRecorder() {
  const allFeeds: { categories?: CategoryTreeNode[]; options?: FeedFetchOptions }[] = [];
  const categoryFeeds: { category: CategoryTreeNode; options?: FeedFetchOptions }[] = [];
  const feed: { options?: FeedFetchOptions; url: string }[] = [];

  return {
    allFeeds,
    categoryFeeds,
    feed,
    fetchers: {
      fetchAllFeeds: async (
        categories?: CategoryTreeNode[],
        options?: FeedFetchOptions,
      ) => {
        allFeeds.push({ categories, options });
      },
      fetchCategoryFeeds: async (
        category: CategoryTreeNode,
        options?: FeedFetchOptions,
      ) => {
        categoryFeeds.push({ category, options });
      },
      fetchFeed: async (url: string, options?: FeedFetchOptions) => {
        feed.push({ options, url });
      },
    },
    reset() {
      allFeeds.length = 0;
      categoryFeeds.length = 0;
      feed.length = 0;
    },
  };
}