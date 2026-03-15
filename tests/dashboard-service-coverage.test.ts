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
  normalizeAutoRefreshIntervalMinutes,
  resolveDefaultAutoRefreshIntervalMinutes,
  toAutoRefreshIntervalMs,
} from "@/app/dashboard/services/refresh-policy";
import {
  initializeDashboardSelection,
  refreshCurrentSelection,
} from "@/app/dashboard/services/selection";
import {
  type Article,
  type CategoryTreeNode,
  DEFAULT_CATEGORY_LABEL,
} from "@/lib";

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
        null,
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
        null,
      ).map((article) => article.link),
    ).toEqual(["https://example.com/unread", "https://example.com/read"]);

    expect(
      filterArticlesByState(
        articles,
        "unread",
        null,
        "https://example.com/starred",
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
    expect(placeholderCategories[0]?.children?.length).toBeGreaterThan(0);
    expect(placeholderCategories[0]?.children?.[0]?.data?.url).toContain(
      "http",
    );
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

describe("dashboard selection services", () => {
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
});
