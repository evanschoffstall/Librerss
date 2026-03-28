import { describe, expect, mock, test } from "bun:test";

import {
  ALL_FEEDS_NODE_KEY,
  DEFAULT_FEED_URL,
} from "@/app/dashboard/constants";
import {
  type ArticleFilter,
  filterArticlesByState,
} from "@/app/dashboard/services/article-filters";
import {
  buildDisplayCategories,
  computeNextOrderedCategoryLabels,
} from "@/app/dashboard/services/category-display";
import {
  getCategoryRemovalTarget,
  removeCategoryFromLocalState,
  restoreSelectedCategoryFromSourceUrl,
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
  buildDashboardControllerState,
  buildDashboardSidebarContentProps,
} from "@/app/dashboard/services/dashboard-controller-state";
import {
  autoRefreshDashboardSelection,
  prefetchDashboardCategory,
  prefetchDashboardFeed,
  refreshDashboardSelection,
  selectDashboardCategory,
  selectDashboardFeed,
} from "@/app/dashboard/services/dashboard-refresh-requests";
import { shouldResetExpandedArticle } from "@/app/dashboard/services/dashboard-selection-state";
import {
  buildDashboardViewModel,
  filterArticlesBySearchTerm,
} from "@/app/dashboard/services/dashboard-view-model";
import {
  isFreshFeedBatchQuery,
  resolveFeedBatchStaleTime,
  shouldNotifyFeedFailureToast,
} from "@/app/dashboard/services/feed-loader-state";
import {
  normalizeFeedSourceInput,
  resolvePostEnabledToggleSelection,
  resolvePostRemovalSelection,
} from "@/app/dashboard/services/feed-source-state";
import {
  getFeedBatchQueryKey,
  getFeedSourceTreeQueryKey,
} from "@/app/dashboard/services/query-keys";
import {
  normalizeAutoRefreshIntervalMinutes,
  resolveDefaultAutoRefreshIntervalMinutes,
  toAutoRefreshIntervalMs,
} from "@/app/dashboard/services/refresh-policy";
import {
  initializeDashboardSelection,
  refreshCurrentSelection,
} from "@/app/dashboard/services/selection";
import {
  clearCompatibilityResultsCache,
  formatElapsed,
  hasConfiguredProxyStatus,
  isCompatibilityResultsCache,
  normalizeCompatibilityResults,
  previewText,
  readCompatibilityResultsCache,
  toProxySettingsSnapshot,
  writeCompatibilityResultsCache,
} from "@/app/dashboard/services/settings-proxy";
import {
  type Article,
  type CategoryTreeNode,
  DEFAULT_CATEGORY_LABEL,
} from "@/lib";
import { PLACEHOLDER_FEED_SOURCES } from "@/lib/core/placeholder";

/** Builds a minimal article fixture for dashboard service tests. */
function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    content: "Article body",
    feedId: 1,
    id: 1,
    lastChecked: new Date("2024-01-01T00:00:00.000Z"),
    link: "https://example.com/article-1",
    publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    title: "Article 1",
    ...overrides,
  };
}

/** Builds a dashboard category node with optional feed children. */
function makeCategoryNode(
  label: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    children,
    key: toCategoryKey(label),
    label,
  };
}

/** Builds a feed node fixture. */
function makeFeedNode(
  options: {
    category?: string;
    enabled?: boolean;
    id?: number;
    key?: string;
    label?: string;
    url?: string;
  } = {},
): CategoryTreeNode {
  const {
    category = DEFAULT_CATEGORY_LABEL,
    enabled = true,
    id = 1,
    key = `${toCategoryKey(category)}-${id}`,
    label = `Feed ${id}`,
    url = `https://example.com/feed-${id}.xml`,
  } = options;

  return {
    data: { category, enabled, sourceId: id, url },
    key,
    label,
  };
}

describe("dashboard article filters", () => {
  const articleStates = {
    all: [true, true, true],
    read: [false, true, true],
    starred: [false, false, true],
    unread: [true, false, false],
  } satisfies Record<ArticleFilter, boolean[]>;

  test("filters articles by state and preserves expanded or collapsing unread context", () => {
    const articles = [
      makeArticle({ id: 1, isRead: false, link: "https://example.com/unread" }),
      makeArticle({ id: 2, isRead: true, link: "https://example.com/read" }),
      makeArticle({
        id: 3,
        isRead: true,
        isStarred: true,
        link: "https://example.com/starred",
      }),
    ];

    for (const [filterName, expectedVisibility] of Object.entries(
      articleStates,
    )) {
      const visibleLinks = filterArticlesByState(
        articles,
        filterName as ArticleFilter,
        null,
        [],
      ).map((article) => article.link);
      const expectedLinks = articles
        .filter((_, index) => expectedVisibility[index])
        .map((article) => article.link);

      expect(visibleLinks).toEqual(expectedLinks);
    }

    expect(
      filterArticlesByState(
        articles,
        "unread",
        "https://example.com/read",
        [],
      ).map((article) => article.link),
    ).toEqual(["https://example.com/unread", "https://example.com/read"]);

    expect(
      filterArticlesByState(
        articles,
        "unread",
        null,
        ["https://example.com/starred"],
      ).map((article) => article.link),
    ).toEqual(["https://example.com/unread", "https://example.com/starred"]);
  });
});

describe("dashboard category tree services", () => {
  test("builds normalized category keys", () => {
    expect(toCategoryKey("World News")).toBe("cat-world-news");
    expect(toCategoryKey("###")).toBe("cat-default");
  });

  test("buildCategoriesFromSources groups feeds by normalized category and source flags", () => {
    const categories = buildCategoriesFromSources([
      {
        category: "Work",
        enabled: false,
        extractionDisabled: true,
        id: 1,
        name: "Team Feed",
        proxyEnabled: true,
        url: "https://example.com/work.xml",
      },
      {
        category: "Work",
        id: 2,
        name: "Ops Feed",
        url: "https://example.com/ops.xml",
      },
      {
        category: "",
        id: 3,
        name: "Default Feed",
        url: "https://example.com/default.xml",
      },
    ]);

    expect(categories).toHaveLength(2);
    expect(categories[0]?.label).toBe("Work");
    expect(categories[0]?.children?.map((node) => node.label)).toEqual([
      "Team Feed",
      "Ops Feed",
    ]);
    expect(categories[0]?.children?.[0]?.data).toEqual({
      category: "Work",
      enabled: false,
      extractionDisabled: true,
      proxyEnabled: true,
      sourceId: 1,
      url: "https://example.com/work.xml",
    });
    expect(categories[1]?.label).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("buildDefaultCategories returns initial or placeholder categories", () => {
    expect(buildDefaultCategories(false)).toHaveLength(1);
    expect(buildDefaultCategories(false)[0]?.label).toBe(
      DEFAULT_CATEGORY_LABEL,
    );

    const placeholderCategories = buildDefaultCategories(true);
    expect(placeholderCategories).toHaveLength(1);
    expect(placeholderCategories[0]?.children?.length).toBe(
      PLACEHOLDER_FEED_SOURCES.length,
    );
    expect(placeholderCategories[0]?.children?.[0]?.data).toEqual({
      category: PLACEHOLDER_FEED_SOURCES[0]?.category,
      enabled: true,
      extractionDisabled: true,
      proxyEnabled: false,
      sourceId: PLACEHOLDER_FEED_SOURCES[0]?.id,
      url: PLACEHOLDER_FEED_SOURCES[0]?.url,
    });
  });

  test("collects and deduplicates known category labels case-insensitively", () => {
    const categories = [makeCategoryNode("Tech"), makeCategoryNode("Design")];

    expect(
      collectKnownCategoryLabels(categories, ["Tech", "Personal"]),
    ).toEqual(["Tech", "Design", "Tech", "Personal"]);
    expect(
      toDistinctCategoryLabels(["Tech", "tech", "Design", "design"]),
    ).toEqual(["Tech", "Design"]);
  });

  test("finds feed nodes and derived feed selection values", () => {
    const techFeed = makeFeedNode({ category: "Tech", id: 1 });
    const designFeed = makeFeedNode({ category: "Design", id: 2 });
    const categories = [
      makeCategoryNode("Tech", [techFeed]),
      makeCategoryNode("Design", [designFeed]),
    ];

    expect(getAllFeedNodes(categories)).toEqual([techFeed, designFeed]);
    expect(findFeedNodeByKey(categories, designFeed.key)).toEqual(designFeed);
    expect(findFeedNodeByUrl(categories, techFeed.data?.url ?? "")).toEqual(
      techFeed,
    );
    expect(getFeedUrlBySelectedKey(categories, techFeed.key)).toBe(
      techFeed.data?.url,
    );
    expect(getFirstFeedNode(categories)).toEqual(techFeed);
    expect(hasCategoryLabelInTree(categories, " design ")).toBe(true);
    expect(hasCategoryLabelInTree(categories, "finance")).toBe(false);
  });

  test("relocates feeds across existing categories and updates their category label", () => {
    const alphaFeed = makeFeedNode({ category: "Tech", id: 1, label: "Alpha" });
    const betaFeed = makeFeedNode({ category: "Tech", id: 2, label: "Beta" });
    const gammaFeed = makeFeedNode({
      category: "Design",
      id: 3,
      label: "Gamma",
    });
    const categories = [
      makeCategoryNode("Tech", [alphaFeed, betaFeed]),
      makeCategoryNode("Design", [gammaFeed]),
    ];

    const relocated = relocateFeedInCategories(
      categories,
      betaFeed.key,
      "Design",
      0,
    );

    expect(relocated[0]?.children?.map((node) => node.label)).toEqual([
      "Alpha",
    ]);
    expect(relocated[1]?.children?.map((node) => node.label)).toEqual([
      "Beta",
      "Gamma",
    ]);
    expect(relocated[1]?.children?.[0]?.data?.category).toBe("Design");
    expect(categories[0]?.children?.map((node) => node.label)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  test("reorders feeds within a category and creates a missing destination category", () => {
    const alphaFeed = makeFeedNode({ category: "Tech", id: 1, label: "Alpha" });
    const betaFeed = makeFeedNode({ category: "Tech", id: 2, label: "Beta" });
    const categories = [makeCategoryNode("Tech", [alphaFeed, betaFeed])];

    const reordered = relocateFeedInCategories(
      categories,
      alphaFeed.key,
      "Tech",
      2,
    );
    expect(reordered[0]?.children?.map((node) => node.label)).toEqual([
      "Beta",
      "Alpha",
    ]);

    const withNewCategory = relocateFeedInCategories(
      categories,
      betaFeed.key,
      "Research",
      0,
    );
    expect(withNewCategory).toHaveLength(2);
    expect(withNewCategory[1]?.label).toBe("Research");
    expect(withNewCategory[1]?.children?.[0]?.label).toBe("Beta");
  });

  test("returns the current categories unchanged when relocation cannot resolve the feed", () => {
    const categories = [makeCategoryNode("Tech", [makeFeedNode({ id: 1 })])];

    expect(
      relocateFeedInCategories(categories, "missing-key", "Design", 0),
    ).toBe(categories);
  });

  test("exposes the all-feeds sentinel category", () => {
    expect(SYSTEM_ALL_FEEDS_CATEGORY).toEqual({
      children: [],
      data: { url: "" },
      key: ALL_FEEDS_NODE_KEY,
      label: "All Feeds",
    });
  });
});

describe("dashboard category display services", () => {
  test("builds display categories from existing, custom, and ordered labels", () => {
    const categories = [makeCategoryNode("Tech"), makeCategoryNode("Design")];

    expect(
      buildDisplayCategories(
        categories,
        ["Research"],
        ["Design", "Research", "Tech"],
      ).map((node) => node.label),
    ).toEqual(["Design", "Research", "Tech"]);

    expect(
      buildDisplayCategories(categories, ["Research"], []).map(
        (node) => node.label,
      ),
    ).toEqual(["Tech", "Design", "Research"]);
  });

  test("computes the next ordered labels by preserving valid items and appending new ones", () => {
    const categories = [makeCategoryNode("Tech"), makeCategoryNode("Design")];

    expect(
      computeNextOrderedCategoryLabels(
        categories,
        ["Research"],
        ["Design", "Missing", "Tech"],
      ),
    ).toEqual(["Design", "Tech", "Research"]);
  });

  test("returns empty display categories when all ordered labels are stale", () => {
    const categories = [
      makeCategoryNode("Tech", [
        makeFeedNode({ category: "Tech", id: 1, label: "Feed A" }),
      ]),
      makeCategoryNode("Science", [
        makeFeedNode({ category: "Science", id: 2, label: "Feed B" }),
      ]),
    ];

    const result = buildDisplayCategories(
      categories,
      [],
      ["OldCat1", "OldCat2"],
    );

    expect(result).toEqual([]);
  });

  test("reconciliation recovers display categories after stale labels are corrected", () => {
    const categories = [
      makeCategoryNode("Tech", [
        makeFeedNode({ category: "Tech", id: 1, label: "Feed A" }),
      ]),
      makeCategoryNode("Science", [
        makeFeedNode({ category: "Science", id: 2, label: "Feed B" }),
      ]),
    ];

    const staleLabels = ["OldCat1", "OldCat2"];
    const reconciledLabels = computeNextOrderedCategoryLabels(
      categories,
      [],
      staleLabels,
    );

    expect(reconciledLabels).toEqual(["Tech", "Science"]);

    const result = buildDisplayCategories(categories, [], reconciledLabels);
    expect(result.map((node) => node.label)).toEqual(["Tech", "Science"]);
  });

  test("reconciliation preserves server order for matching labels and appends new categories", () => {
    const categories = [
      makeCategoryNode("Tech"),
      makeCategoryNode("Science"),
      makeCategoryNode("News"),
      makeCategoryNode("Gaming"),
    ];

    const serverOrder = ["News", "Tech", "Science"];
    const reconciled = computeNextOrderedCategoryLabels(
      categories,
      [],
      serverOrder,
    );

    expect(reconciled).toEqual(["News", "Tech", "Science", "Gaming"]);
  });

  test("reconciliation produces stable output on repeated calls with same input", () => {
    const categories = [
      makeCategoryNode("Tech"),
      makeCategoryNode("Science"),
    ];

    const first = computeNextOrderedCategoryLabels(
      categories,
      [],
      ["Tech", "Science"],
    );
    const second = computeNextOrderedCategoryLabels(categories, [], first);

    expect(second).toEqual(first);
  });
});

describe("dashboard refresh policy services", () => {
  test("normalizes automatic refresh intervals to the 30-minute floor", () => {
    expect(normalizeAutoRefreshIntervalMinutes(30)).toBe(30);
    expect(normalizeAutoRefreshIntervalMinutes(12)).toBe(30);
    expect(normalizeAutoRefreshIntervalMinutes(47.6)).toBe(48);
    expect(normalizeAutoRefreshIntervalMinutes(Number.NaN, 60)).toBe(60);
  });

  test("resolves and converts the default automatic refresh cadence", () => {
    expect(resolveDefaultAutoRefreshIntervalMinutes(15)).toBe(30);
    expect(resolveDefaultAutoRefreshIntervalMinutes(45)).toBe(45);
    expect(toAutoRefreshIntervalMs(45)).toBe(45 * 60 * 1000);
  });
});

describe("feed loader state services", () => {
  test("resolves selection freshness windows by request type", () => {
    expect(resolveFeedBatchStaleTime({ forceRefresh: true })).toBe(0);
    expect(resolveFeedBatchStaleTime({ skipRefresh: true })).toBe(60_000);
    expect(resolveFeedBatchStaleTime({ requestSource: "manual-refresh" })).toBe(
      0,
    );
    expect(resolveFeedBatchStaleTime()).toBeGreaterThan(0);
  });

  test("detects whether a cached feed batch query is still fresh", () => {
    const queryKey = getFeedBatchQueryKey("signature", {});
    const queryClient = {
      getQueryState: mock(() => ({
        dataUpdatedAt: Date.now() - 1_000,
        status: "success",
      })),
    };

    expect(isFreshFeedBatchQuery(queryClient, queryKey, 5_000)).toBe(true);
    expect(isFreshFeedBatchQuery(queryClient, queryKey, 0)).toBe(false);
  });

  test("suppresses feed failure toasts for skip-refresh cache reads", () => {
    expect(shouldNotifyFeedFailureToast()).toBe(true);
    expect(shouldNotifyFeedFailureToast(undefined, true)).toBe(false);
    expect(shouldNotifyFeedFailureToast({ skipRefresh: true })).toBe(false);
  });
});

describe("dashboard query-key services", () => {
  test("builds stable feed batch keys for refresh and skip-refresh requests", () => {
    const knownLastFetchedAtByUrl = new Map([
      ["https://example.com/a.xml", new Date("2024-01-01T00:00:00.000Z")],
      ["https://example.com/z.xml", new Date("2024-03-03T12:00:00.000Z")],
    ]);

    expect(
      getFeedBatchQueryKey("signature", {
        knownLastFetchedAtByUrl,
      }),
    ).toEqual([
      "dashboard",
      "feed-batch",
      "signature",
      "refresh",
      "https://example.com/a.xml@2024-01-01T00:00:00.000Z|https://example.com/z.xml@2024-03-03T12:00:00.000Z",
    ]);
    expect(
      getFeedBatchQueryKey("signature", {
        knownLastFetchedAtByUrl: new Map(),
        skipRefresh: true,
      }),
    ).toEqual([
      "dashboard",
      "feed-batch",
      "signature",
      "skip-refresh",
      "",
    ]);
  });

  test("builds live and placeholder feed source tree keys", () => {
    expect(getFeedSourceTreeQueryKey(false)).toEqual([
      "dashboard",
      "feed-source-tree",
      "live",
    ]);
    expect(getFeedSourceTreeQueryKey(true)).toEqual([
      "dashboard",
      "feed-source-tree",
      "placeholder",
    ]);
  });
});

describe("dashboard selection services", () => {
  test("resets the expanded article only when category or filter changes", () => {
    expect(
      shouldResetExpandedArticle({
        articleFilter: "all",
        previousArticleFilter: "all",
        previousSelectedCategory: "tech",
        selectedCategory: "tech",
      }),
    ).toBe(false);

    expect(
      shouldResetExpandedArticle({
        articleFilter: "read",
        previousArticleFilter: "all",
        previousSelectedCategory: "tech",
        selectedCategory: "tech",
      }),
    ).toBe(true);

    expect(
      shouldResetExpandedArticle({
        articleFilter: "all",
        previousArticleFilter: "all",
        previousSelectedCategory: "tech",
        selectedCategory: "design",
      }),
    ).toBe(true);
  });

  test("initializes the all-feeds selection and always releases category loading", async () => {
    const categories = [makeCategoryNode("Tech")];
    const fetchAllFeeds = mock(async () => {});
    const setIsCategoriesLoading = mock(() => {});

    await initializeDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds: mock(async () => {}),
      fetchFeed: mock(async () => {}),
      loadFeedSources: mock(async () => categories),
      selectedCategory: ALL_FEEDS_NODE_KEY,
      setIsCategoriesLoading,
      setSelectedCategory: mock(() => {}),
    });

    expect(fetchAllFeeds).toHaveBeenCalledWith(categories, {
      requestSource: "dashboard-initial-cache",
      skipRefresh: true,
    });
    expect(setIsCategoriesLoading).toHaveBeenCalledWith(false);
  });

  test("initializes a selected feed, selected category, or fallback all-feeds path", async () => {
    const directFeed = makeFeedNode({ category: "Tech", id: 1, key: "feed-1" });
    const disabledFeed = makeFeedNode({
      category: "Tech",
      enabled: false,
      id: 2,
      key: "feed-2",
    });
    const techCategory = makeCategoryNode("Tech", [directFeed, disabledFeed]);
    const categories = [techCategory];

    const fetchFeed = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});
    const fetchAllFeeds = mock(async () => {});
    const setSelectedCategory = mock(() => {});

    await initializeDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      loadFeedSources: mock(async () => categories),
      selectedCategory: directFeed.key,
      setIsCategoriesLoading: mock(() => {}),
      setSelectedCategory,
    });
    expect(fetchFeed).toHaveBeenCalledWith(directFeed.data?.url, {
      requestSource: "dashboard-initial-cache",
      skipRefresh: true,
    });

    await initializeDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed: mock(async () => {}),
      loadFeedSources: mock(async () => categories),
      selectedCategory: techCategory.key,
      setIsCategoriesLoading: mock(() => {}),
      setSelectedCategory,
    });
    expect(fetchCategoryFeeds).toHaveBeenCalledWith(techCategory, {
      requestSource: "dashboard-initial-cache",
      skipRefresh: true,
    });

    await initializeDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds: mock(async () => {}),
      fetchFeed: mock(async () => {}),
      loadFeedSources: mock(async () => categories),
      selectedCategory: "missing-key",
      setIsCategoriesLoading: mock(() => {}),
      setSelectedCategory,
    });
    expect(setSelectedCategory).toHaveBeenCalledWith(ALL_FEEDS_NODE_KEY);
    expect(fetchAllFeeds).toHaveBeenCalledWith(categories, {
      requestSource: "dashboard-initial-cache",
      skipRefresh: true,
    });
  });

  test("releases category loading even when initialization throws", async () => {
    const setIsCategoriesLoading = mock(() => {});

    await expect(
      initializeDashboardSelection({
        fetchAllFeeds: mock(async () => {}),
        fetchCategoryFeeds: mock(async () => {}),
        fetchFeed: mock(async () => {}),
        loadFeedSources: mock(async () => {
          throw new Error("load failure");
        }),
        selectedCategory: ALL_FEEDS_NODE_KEY,
        setIsCategoriesLoading,
        setSelectedCategory: mock(() => {}),
      }),
    ).rejects.toThrow("load failure");

    expect(setIsCategoriesLoading).toHaveBeenCalledWith(false);
  });

  test("refreshes the active all-feeds, feed, category, or fallback surface", () => {
    const fetchAllFeeds = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});
    const fetchFeed = mock(async () => {});
    const selectedCategoryNode = makeCategoryNode("Tech");

    refreshCurrentSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      forceRefresh: true,
      keepExistingFeed: true,
      requestSource: "manual-refresh",
      selectedCategory: ALL_FEEDS_NODE_KEY,
      skipRefresh: false,
    });
    expect(fetchAllFeeds).toHaveBeenCalledWith(undefined, {
      forceRefresh: true,
      keepExistingFeed: true,
      requestSource: "manual-refresh",
      skipRefresh: false,
    });

    refreshCurrentSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      selectedCategory: "feed-key",
      selectedFeedUrl: "https://example.com/direct.xml",
    });
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/direct.xml", {
      forceRefresh: false,
      keepExistingFeed: undefined,
      requestSource: undefined,
      skipRefresh: undefined,
    });

    refreshCurrentSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      selectedCategory: selectedCategoryNode.key,
      selectedCategoryNode,
    });
    expect(fetchCategoryFeeds).toHaveBeenCalledWith(selectedCategoryNode, {
      forceRefresh: false,
      keepExistingFeed: undefined,
      requestSource: undefined,
      skipRefresh: undefined,
    });

    refreshCurrentSelection({
      fallbackFeedUrl: "https://example.com/fallback.xml",
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      selectedCategory: "missing",
    });
    expect(fetchFeed).toHaveBeenCalledWith("https://example.com/fallback.xml", {
      forceRefresh: false,
      keepExistingFeed: undefined,
      requestSource: undefined,
      skipRefresh: undefined,
    });

    refreshCurrentSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      selectedCategory: "missing-default",
    });
    expect(fetchFeed).toHaveBeenCalledWith(DEFAULT_FEED_URL, {
      forceRefresh: false,
      keepExistingFeed: undefined,
      requestSource: undefined,
      skipRefresh: undefined,
    });
  });

  test("delegates dashboard refresh requests to the shared selection service", () => {
    const fetchAllFeeds = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});
    const fetchFeed = mock(async () => {});
    const onBeforeRefresh = mock(() => {});
    const selectedCategoryNode = makeCategoryNode("Tech");

    refreshDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      onBeforeRefresh,
      selectedCategory: selectedCategoryNode.key,
      selectedCategoryNode,
    });
    autoRefreshDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      onBeforeRefresh,
      selectedCategory: selectedCategoryNode.key,
      selectedCategoryNode,
    });

    expect(onBeforeRefresh).toHaveBeenCalledTimes(2);
    expect(fetchCategoryFeeds).toHaveBeenNthCalledWith(1, selectedCategoryNode, {
      forceRefresh: true,
      keepExistingFeed: true,
      requestSource: "manual-refresh",
      skipRefresh: undefined,
    });
    expect(fetchCategoryFeeds).toHaveBeenNthCalledWith(2, selectedCategoryNode, {
      forceRefresh: false,
      keepExistingFeed: true,
      requestSource: "auto-refresh",
      skipRefresh: undefined,
    });
  });

  test("handles dashboard feed and category selection requests", () => {
    const fetchAllFeeds = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});
    const fetchFeed = mock(async () => {});
    const setIsMobileSidebarOpen = mock(() => {});
    const setSelectedCategory = mock(() => {});

    const feedNode = makeFeedNode({ category: "Tech", id: 10, key: "feed-10" });
    selectDashboardFeed(feedNode, {
      fetchFeed,
      setIsMobileSidebarOpen,
      setSelectedCategory,
    });
    expect(setSelectedCategory).toHaveBeenCalledWith(feedNode.key);
    expect(setIsMobileSidebarOpen).toHaveBeenCalledWith(false);
    expect(fetchFeed).toHaveBeenCalledWith(feedNode.data?.url, {
      requestSource: "sidebar-feed-select",
    });

    const disabledFeedNode = makeFeedNode({
      category: "Tech",
      enabled: false,
      id: 11,
      key: "feed-11",
    });
    selectDashboardFeed(disabledFeedNode, {
      fetchFeed,
      setIsMobileSidebarOpen,
      setSelectedCategory,
    });
    expect(fetchFeed).toHaveBeenCalledTimes(1);

    const categoryNode = makeCategoryNode("Tech", [feedNode]);
    selectDashboardCategory(categoryNode, {
      fetchAllFeeds,
      fetchCategoryFeeds,
      setIsMobileSidebarOpen,
      setSelectedCategory,
    });
    expect(fetchCategoryFeeds).toHaveBeenCalledWith(categoryNode, {
      requestSource: "sidebar-category-select",
    });

    selectDashboardCategory(
      { key: ALL_FEEDS_NODE_KEY, label: "All feeds" },
      {
        fetchAllFeeds,
        fetchCategoryFeeds,
        setIsMobileSidebarOpen,
        setSelectedCategory,
      },
    );
    expect(fetchAllFeeds).toHaveBeenCalledWith(undefined, {
      requestSource: "sidebar-category-select",
    });
  });

  test("prefetches dashboard feed and category requests only when selection changes", () => {
    const prefetchAllFeeds = mock(async () => {});
    const prefetchCategoryFeeds = mock(async () => {});
    const prefetchFeed = mock(async () => {});
    const feedNode = makeFeedNode({ category: "Tech", id: 1, key: "feed-1" });
    const categoryNode = makeCategoryNode("Tech", [feedNode]);

    prefetchDashboardFeed(feedNode, {
      prefetchFeed,
      selectedCategory: ALL_FEEDS_NODE_KEY,
    });
    expect(prefetchFeed).toHaveBeenCalledWith(feedNode.data?.url, {
      requestSource: "sidebar-feed-prefetch",
    });

    prefetchDashboardFeed(feedNode, {
      prefetchFeed,
      selectedCategory: feedNode.key,
    });
    expect(prefetchFeed).toHaveBeenCalledTimes(1);

    prefetchDashboardCategory(categoryNode, {
      prefetchAllFeeds,
      prefetchCategoryFeeds,
      selectedCategory: ALL_FEEDS_NODE_KEY,
    });
    expect(prefetchCategoryFeeds).toHaveBeenCalledWith(categoryNode, {
      requestSource: "sidebar-category-prefetch",
    });

    prefetchDashboardCategory(
      { key: ALL_FEEDS_NODE_KEY, label: "All feeds" },
      {
        prefetchAllFeeds,
        prefetchCategoryFeeds,
        selectedCategory: categoryNode.key,
      },
    );
    expect(prefetchAllFeeds).toHaveBeenCalledWith(undefined, {
      requestSource: "sidebar-category-prefetch",
    });
  });
});

describe("category operation state services", () => {
  test("chooses a non-removed category target and rehomes local feeds", () => {
    const workFeed = makeFeedNode({ category: "Work", id: 1 });
    const categories = [
      makeCategoryNode("Work", [workFeed]),
      makeCategoryNode("Personal"),
    ];

    expect(
      getCategoryRemovalTarget(categories, ["Work", "Personal"], "Work"),
    ).toBe("Personal");

    const nextCategories = removeCategoryFromLocalState(
      categories,
      "Work",
      "Archive",
    );

    expect(nextCategories.map((category) => category.label)).toEqual([
      "Personal",
      "Archive",
    ]);
    expect(nextCategories[1]?.children?.[0]?.data?.category).toBe("Archive");
  });

  test("restores the selected category from a selected source URL", () => {
    const feedNode = makeFeedNode({ category: "Tech", id: 1, key: "feed-1" });
    const setSelectedCategory = mock(() => {});

    restoreSelectedCategoryFromSourceUrl({
      refreshedCategories: [makeCategoryNode("Tech", [feedNode])],
      selectedSourceUrl: feedNode.data?.url,
      setSelectedCategory,
    });

    expect(setSelectedCategory).toHaveBeenCalledWith(feedNode.key);
  });
});

describe("feed source state services", () => {
  test("normalizes feed source inputs before persistence", () => {
    expect(normalizeFeedSourceInput(" Feed ", " https://example.com/feed.xml ")).toEqual({
      name: "Feed",
      url: "https://example.com/feed.xml",
    });
  });

  test("resolves post-removal selection fallbacks", () => {
    const feedNode = makeFeedNode({ category: "Tech", id: 1, key: "feed-1" });
    const categories = [makeCategoryNode("Tech", [feedNode])];
    const feedUrl = feedNode.data?.url ?? "";

    expect(resolvePostRemovalSelection([], "feed-1", "feed-1")).toEqual({
      type: "clear",
    });

    expect(
      resolvePostRemovalSelection(categories, "feed-1", "feed-1"),
    ).toEqual({
      feedUrl,
      nextSelectedCategory: feedNode.key,
      type: "feed",
    });
  });

  test("resolves post-enabled-toggle selection targets", () => {
    const feedNode = makeFeedNode({ category: "Tech", id: 1, key: "feed-1" });
    const categories = [makeCategoryNode("Tech", [feedNode])];
    const feedUrl = feedNode.data?.url ?? "";

    expect(
      resolvePostEnabledToggleSelection(
        categories,
        "feed-1",
        feedUrl,
        false,
        "feed-1",
      ),
    ).toEqual({
      nextSelectedCategory: ALL_FEEDS_NODE_KEY,
      type: "all-feeds",
    });

    expect(
      resolvePostEnabledToggleSelection(
        categories,
        ALL_FEEDS_NODE_KEY,
        feedUrl,
        true,
        "feed-1",
      ),
    ).toEqual({
      feedUrl,
      type: "feed",
    });
  });
});

describe("settings proxy services", () => {
  test("formats elapsed timestamps and truncates previews", () => {
    expect(formatElapsed(Date.now() - 45_000, Date.now())).toMatch(/s ago$/);
    expect(previewText("x".repeat(100))).toEndWith("...");
    expect(previewText("short")).toBe("short");
  });

  test("recognizes a compatibility cache payload shape", () => {
    expect(
      isCompatibilityResultsCache({ checkedAt: Date.now(), results: [] }),
    ).toBe(true);
    expect(isCompatibilityResultsCache(null)).toBe(false);
    expect(isCompatibilityResultsCache({ checkedAt: Date.now() })).toBe(false);
    expect(
      isCompatibilityResultsCache({
        checkedAt: Date.now(),
        results: [{ compatibilitySignalDetected: true, success: true }],
      }),
    ).toBe(false);

    const storage = window.localStorage;
    writeCompatibilityResultsCache(storage, {
      checkedAt: 12,
      results: normalizeCompatibilityResults([
        {
          compatibilitySignalDetected: true,
          statusCode: 200,
          success: true,
          vendor: "Example CDN",
        },
      ]),
    });
    expect(readCompatibilityResultsCache(storage)).toEqual({
      checkedAt: 12,
      results: [
        {
          compatibilitySignalDetected: true,
          statusCode: 200,
          success: true,
          vendor: "Example CDN",
        },
      ],
    });

    clearCompatibilityResultsCache(storage);
    expect(readCompatibilityResultsCache(storage)).toBeNull();
  });

  test("normalizes persisted proxy settings into hook-friendly state", () => {
    expect(
      toProxySettingsSnapshot({
        allowInsecureTls: true,
        error: "Proxy responded slowly",
        hasProxyPassword: true,
        proxyUrl: "https://proxy.example.test",
        proxyUsername: "alice",
        status: "reachable",
      }),
    ).toEqual({
      allowInsecureTls: true,
      error: "Proxy responded slowly",
      hasProxyPassword: true,
      proxyStatus: "reachable",
      proxyUrl: "https://proxy.example.test",
      proxyUsername: "alice",
    });

    expect(
      toProxySettingsSnapshot({
        allowInsecureTls: false,
        hasProxyPassword: false,
        proxyUrl: null,
        proxyUsername: null,
        status: "unreachable",
      }),
    ).toEqual({
      allowInsecureTls: false,
      error: null,
      hasProxyPassword: false,
      proxyStatus: "none",
      proxyUrl: "",
      proxyUsername: "",
    });

    expect(hasConfiguredProxyStatus("checking")).toBe(true);
    expect(hasConfiguredProxyStatus("reachable")).toBe(true);
    expect(hasConfiguredProxyStatus("unreachable")).toBe(true);
    expect(hasConfiguredProxyStatus("none")).toBe(false);
    expect(hasConfiguredProxyStatus("loading")).toBe(false);
  });
});

// ─── buildDashboardViewModel ─────────────────────────────────────────────────

describe("buildDashboardViewModel", () => {
  const baseInput = {
    articleFilter: "all" as ArticleFilter,
    categories: [
      makeCategoryNode("Tech", [
        makeFeedNode({ category: "Tech", id: 1, label: "Feed 1" }),
        makeFeedNode({ category: "Tech", enabled: false, id: 2, label: "Disabled Feed" }),
      ]),
    ],
    collapsingArticleKeys: [] as string[],
    customCategoryLabels: ["Tech"],
    expandedArticleKey: null as null | string,
    feed: [
      makeArticle({ id: 1, link: "https://example.com/a1", title: "First" }),
      makeArticle({ id: 2, link: "https://example.com/a2", title: "Second" }),
    ],
    orderedCategoryLabels: ["Tech"],
    searchTerm: "",
    selectedCategory: ALL_FEEDS_NODE_KEY,
  };

  test("returns all articles when no filter or search is active", () => {
    const vm = buildDashboardViewModel(baseInput);
    expect(vm.filteredFeed).toHaveLength(2);
    expect(vm.sidebarCategories.length).toBeGreaterThanOrEqual(1);
    expect(vm.displayCategories.map((category) => category.label)).toContain(
      "Tech",
    );
  });

  test("filters articles by search term", () => {
    const vm = buildDashboardViewModel({
      ...baseInput,
      searchTerm: "First",
    });
    expect(vm.filteredFeed).toHaveLength(1);
    expect(vm.filteredFeed[0]!.title).toBe("First");
  });

  test("excludes disabled feeds from sidebar categories", () => {
    const vm = buildDashboardViewModel(baseInput);
    const techCategory = vm.sidebarCategories.find(
      (c) => c.label === "Tech",
    );
    expect(techCategory).toBeDefined();
    const feedLabels = (techCategory!.children ?? []).map((c) => c.label);
    expect(feedLabels).not.toContain("Disabled Feed");
  });

  test("resolves selectedFeedUrl to undefined for disabled feeds", () => {
    const disabledFeedKey = makeFeedNode({
      category: "Tech",
      enabled: false,
      id: 2,
    }).key;
    const vm = buildDashboardViewModel({
      ...baseInput,
      selectedCategory: disabledFeedKey,
    });
    expect(vm.selectedFeedUrl).toBeUndefined();
  });

  test("resolves selectedFeed label for valid category", () => {
    const vm = buildDashboardViewModel({
      ...baseInput,
      selectedCategory: ALL_FEEDS_NODE_KEY,
    });
    expect(vm.selectedFeed).toBeDefined();
  });

  test("shows only All Feeds when ordered labels are fully stale", () => {
    const categories = [
      makeCategoryNode("Tech", [
        makeFeedNode({ category: "Tech", id: 1, label: "Feed A" }),
      ]),
      makeCategoryNode("Science", [
        makeFeedNode({ category: "Science", id: 2, label: "Feed B" }),
      ]),
    ];

    const vm = buildDashboardViewModel({
      ...baseInput,
      categories,
      customCategoryLabels: [],
      orderedCategoryLabels: ["OldCat1", "OldCat2"],
    });

    expect(vm.sidebarCategories.map((c) => c.label)).toEqual(["All Feeds"]);
  });

  test("recovers full sidebar after stale labels are reconciled", () => {
    const categories = [
      makeCategoryNode("Tech", [
        makeFeedNode({ category: "Tech", id: 1, label: "Feed A" }),
      ]),
      makeCategoryNode("Science", [
        makeFeedNode({ category: "Science", id: 2, label: "Feed B" }),
      ]),
    ];

    const reconciledLabels = computeNextOrderedCategoryLabels(
      categories,
      [],
      ["OldCat1", "OldCat2"],
    );

    const vm = buildDashboardViewModel({
      ...baseInput,
      categories,
      customCategoryLabels: [],
      orderedCategoryLabels: reconciledLabels,
    });

    expect(vm.sidebarCategories.map((c) => c.label)).toEqual([
      "All Feeds",
      "Tech",
      "Science",
    ]);
  });
});

describe("dashboard controller state services", () => {
  test("builds stable sidebar props for dashboard rails", () => {
    const sidebarCategories = [makeCategoryNode("Tech")];
    const sidebarContentProps = buildDashboardSidebarContentProps({
      isCategoriesLoading: false,
      isSidebarVisible: true,
      onCategoryClick: mock(() => {}),
      onCategoryPrefetch: mock(() => {}),
      onFeedClick: mock(() => {}),
      onFeedPrefetch: mock(() => {}),
      selectedCategory: "tech",
      showFavicons: true,
      sidebarCategories,
    });

    expect(sidebarContentProps.sidebarCategories).toEqual(sidebarCategories);
    expect(sidebarContentProps.selectedCategory).toBe("tech");
    expect(sidebarContentProps.showFavicons).toBe(true);
  });

  test("assembles grouped dashboard controller surfaces", () => {
    const sidebarContentProps = buildDashboardSidebarContentProps({
      isCategoriesLoading: false,
      isSidebarVisible: true,
      onCategoryClick: mock(() => {}),
      onCategoryPrefetch: mock(() => {}),
      onFeedClick: mock(() => {}),
      onFeedPrefetch: mock(() => {}),
      selectedCategory: "all-feeds",
      showFavicons: false,
      sidebarCategories: [makeCategoryNode("Tech")],
    });

    const controllerState = buildDashboardControllerState({
      feedList: {
        articleFilter: "all",
        articlesPerPage: 6,
        collapsingArticles: {},
        expandedArticleKey: null,
        feedViewKey: "all-feeds:all",
        filteredFeed: [],
        hasConfiguredFeeds: true,
        hydratedArticleLinks: {},
        hydratingArticleLinks: {},
        isCollapseScrollRestoreActive: false,
        isInitialLoading: false,
        isRefreshing: false,
        onArticleExpandedSwipeRead: mock(() => {}),
        onArticlePrepareExpand: mock(() => {}),
        onArticleSwipeRead: mock(() => {}),
        onArticleToggle: mock(() => {}),
        onArticleToggleRead: mock(() => {}),
        onArticleToggleStarred: mock(() => {}),
        refreshEpoch: 0,
        searchTerm: "",
        showFavicons: false,
        updatingArticleState: {},
      },
      filterBar: {
        articleFilter: "all",
        lastRefreshLabel: "Updated just now",
        loading: false,
        setArticleFilter: mock(() => {}),
      },
      settings: {
        articlesPerPage: 6,
        autoRefreshIntervalMinutes: 30,
        backgroundMode: "none",
        categories: [makeCategoryNode("Tech")],
        categoryTree: { addCategory: mock(() => true) },
        distillStrategy: "readability",
        handleCloseSettings: mock(() => {}),
        onBackgroundModeChange: mock(() => {}),
        onDistillStrategyChange: mock(() => {}),
        selectedCategory: "all-feeds",
        setArticlesPerPage: mock(() => {}),
        setAutoRefreshIntervalMinutes: mock(() => {}),
        setShowFavicons: mock(() => {}),
        showFavicons: false,
        showSettingsModal: true,
        usePlaceholderData: false,
      },
      sidebar: {
        isMobileSidebarOpen: false,
        isSidebarVisible: true,
        setIsMobileSidebarOpen: mock(() => {}),
        sidebarContentProps,
        sidebarScrollRef: mock(() => {}),
      },
    });

    expect(controllerState.feedList.feedViewKey).toBe("all-feeds:all");
    expect(controllerState.settings.showSettingsModal).toBe(true);
    expect(controllerState.sidebar.sidebarContentProps).toEqual(
      sidebarContentProps,
    );
    expect(controllerState.filterBar.lastRefreshLabel).toBe(
      "Updated just now",
    );
  });
});

// ─── filterArticlesBySearchTerm ──────────────────────────────────────────────

describe("filterArticlesBySearchTerm", () => {
  const articles = [
    makeArticle({ content: "JavaScript tutorial", id: 1, title: "Learn JS" }),
    makeArticle({ content: "Python guide", id: 2, title: "Learn Python" }),
    makeArticle({ content: "Rust systems", id: 3, title: "Low-level Rust" }),
  ];

  test("returns all articles for empty search", () => {
    expect(filterArticlesBySearchTerm(articles, "")).toEqual(articles);
    expect(filterArticlesBySearchTerm(articles, "  ")).toEqual(articles);
  });

  test("matches by title case-insensitively", () => {
    const result = filterArticlesBySearchTerm(articles, "learn js");
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Learn JS");
  });

  test("matches by content", () => {
    const result = filterArticlesBySearchTerm(articles, "systems");
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Low-level Rust");
  });

  test("returns empty for no match", () => {
    expect(filterArticlesBySearchTerm(articles, "golang")).toEqual([]);
  });
});
