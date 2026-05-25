import { describe, expect, mock, test } from "bun:test";

import {
  ARTICLE_SORT_ORDER_OPTIONS,
  filterArticlesByState,
  resolveArticleWindowAvailability,
  shouldBlockArticleWindowLoadMore,
  shouldRefillDepletedUnreadWindow,
  sortArticlesByOrder,
} from "@/app/dashboard/services/article";
import {
  dedupeAndSortArticles,
  getArticleKey,
} from "@/app/dashboard/services/article-collection";
import {
  buildDisplayCategories,
  computeNextOrderedCategoryLabels,
} from "@/app/dashboard/services/category";
import {
  buildDashboardControllerState,
  buildDashboardSidebarContentProps,
  buildDashboardViewModel,
  filterArticlesBySearchTerm,
} from "@/app/dashboard/services/dashboard-state";
import {
  buildFeedBatchOutcome,
  formatFeedFailureLabel,
  resolveFeedBatchResults,
} from "@/app/dashboard/services/feed-data";
import { isArticleSortOrder } from "@/lib/core";

import { buildFeedListArticle } from "./feed-list-test-utils";

function createCategory(label: string, children: any[] = []) {
  return {
    children,
    key: label.toLowerCase(),
    label,
  };
}

function createFeedNode(
  key: string,
  label: string,
  url: string,
  enabled = true,
) {
  return {
    children: [],
    data: { enabled, url },
    key,
    label,
  };
}

describe("dashboard pure service coverage", () => {
  test("dedupe and sort articles by content quality and publication date", () => {
    const blank = buildFeedListArticle({ id: 1, link: "   " });
    const olderShort = buildFeedListArticle({
      content: "short",
      id: 2,
      link: "https://example.com/a",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    });
    const newerLong = buildFeedListArticle({
      content: "much longer content",
      id: 3,
      link: " https://example.com/a ",
      publicationDate: new Date("2024-01-02T00:00:00.000Z"),
    });
    const newest = buildFeedListArticle({
      content: "other",
      id: 4,
      link: "https://example.com/b",
      publicationDate: new Date("2024-01-03T00:00:00.000Z"),
    });

    expect(getArticleKey(newerLong)).toBe("https://example.com/a");
    expect(
      dedupeAndSortArticles([blank, olderShort, newerLong, newest]),
    ).toEqual([newest, newerLong]);
  });

  test("filter articles by dashboard state", () => {
    const unread = buildFeedListArticle({
      id: 10,
      isRead: false,
      link: "https://example.com/u",
    });
    const read = buildFeedListArticle({
      id: 11,
      isRead: true,
      link: "https://example.com/r",
    });
    const starred = buildFeedListArticle({
      id: 12,
      isRead: true,
      isStarred: true,
      link: "https://example.com/s",
    });
    const articles = [unread, read, starred];

    expect(filterArticlesByState(articles, "all", null, [])).toEqual(articles);
    expect(filterArticlesByState(articles, "read", null, [])).toEqual([
      read,
      starred,
    ]);
    expect(filterArticlesByState(articles, "starred", null, [])).toEqual([
      starred,
    ]);
    expect(filterArticlesByState(articles, "unread", null, [])).toEqual([
      unread,
    ]);
    expect(filterArticlesByState(articles, "unread", read.link, [])).toEqual([
      unread,
      read,
    ]);
    expect(
      filterArticlesByState(articles, "unread", null, [starred.link]),
    ).toEqual([unread, starred]);
  });

  test("build display categories and preserve ordered category labels", () => {
    const tech = createCategory("Tech", [
      createFeedNode("feed-1", "Feed 1", "https://example.com/1"),
    ]);
    const news = createCategory("News", [
      createFeedNode("feed-2", "Feed 2", "https://example.com/2"),
    ]);

    expect(
      buildDisplayCategories([tech], ["Custom"], ["Custom", "Tech"]),
    ).toEqual([{ children: [], key: "cat-custom", label: "Custom" }, tech]);

    expect(
      computeNextOrderedCategoryLabels(
        [tech, news],
        ["Custom"],
        ["News", "Missing", "Tech"],
      ),
    ).toEqual(["News", "Tech", "Custom"]);
  });

  test("build the dashboard controller and sidebar prop bags as stable pass-through contracts", () => {
    const sidebarContent = buildDashboardSidebarContentProps({
      isCategoriesLoading: false,
      isSidebarVisible: true,
      onCategoryClick: mock(() => {}),
      onCategoryPrefetch: mock(() => {}),
      onFeedClick: mock(() => {}),
      onFeedPrefetch: mock(() => {}),
      selectedCategory: "all",
      showFavicons: true,
      sidebarCategories: [],
    });

    const controllerState = buildDashboardControllerState({
      feedList: { articlesPerPage: 10 },
      filterBar: { articleFilter: "all" },
      settings: { showSettingsModal: false },
      sidebar: { sidebarContentProps: sidebarContent },
    } as any);

    expect(sidebarContent.selectedCategory).toBe("all");
    expect(controllerState.sidebar.sidebarContentProps).toBe(sidebarContent);
  });

  test("preserves server pagination after local unread removals until a server window settles", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 3,
        hasStartedAwaitedWindowSettlement: false,
        isAwaitingWindowSettlement: false,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 0,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 8,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });

    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 6,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 0,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 8,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });

    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 8,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 0,
        previousHasMoreServerArticles: false,
        requestedArticleLimit: 8,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    });

    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: true,
        currentFeedLength: 18,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 12,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 24,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    });

    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: true,
        currentFeedLength: 18,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 18,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 36,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });

    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "unread",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 4,
        hasMoreServerArticles: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        isRefillingDepletedUnreadWindow: false,
        previousFilteredFeedLength: 8,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "all",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 0,
        hasMoreServerArticles: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        isRefillingDepletedUnreadWindow: false,
        previousFilteredFeedLength: 1,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 0,
        hasMoreServerArticles: true,
        isCategoriesLoading: false,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: true,
        isCategoriesLoading: true,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: true,
        isCategoriesLoading: false,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);
  });

  test("build the dashboard view model and search filters from current selection state", () => {
    const enabledFeed = createFeedNode(
      "feed-1",
      "Feed 1",
      "https://example.com/1",
    );
    const disabledFeed = createFeedNode(
      "feed-2",
      "Feed 2",
      "https://example.com/2",
      false,
    );
    const categories = [
      createCategory("Tech", [enabledFeed]),
      createCategory("Disabled", [disabledFeed]),
      createCategory("Empty", []),
    ];
    const articles = [
      buildFeedListArticle({
        content: "secondary body",
        feedName: "Source needle",
        id: 20,
        link: "https://example.com/title",
        publicationDate: new Date("2026-03-13T11:00:00.000Z"),
        title: "Source-only title",
      }),
      buildFeedListArticle({
        content: "contains special search needle",
        id: 21,
        link: "https://example.com/body-needle",
        publicationDate: new Date("2026-03-13T10:00:00.000Z"),
        title: "Other",
      }),
      buildFeedListArticle({
        content: "hidden",
        id: 22,
        isRead: true,
        link: "https://example.com/read",
        title: "Read item",
      }),
    ];

    expect(filterArticlesBySearchTerm(articles, "   ")).toBe(articles);

    const viewModel = buildDashboardViewModel({
      articleFilter: "all",
      articleSortOrder: "newest",
      categories,
      collapsingArticleKeys: [],
      customCategoryLabels: ["Custom"],
      expandedArticleKey: null,
      feed: articles,
      orderedCategoryLabels: ["Custom", "Tech", "Disabled"],
      searchTerm: "needle",
      selectedCategory: "feed-2",
      useLocalSearch: true,
      usePlaceholderData: false,
    });

    expect(viewModel.filteredFeed.map((article) => article.link)).toEqual([
      "https://example.com/title",
      "https://example.com/body-needle",
    ]);
    expect(
      viewModel.displayCategories.map((category) => category.label),
    ).toEqual(["Custom", "Tech", "Disabled"]);
    expect(
      viewModel.sidebarCategories.map((category) => category.label),
    ).toEqual(["All Feeds", "Tech"]);
    expect(viewModel.selectedFeed).toBe("Feed 2");
    expect(viewModel.selectedFeedUrl).toBeUndefined();
  });

  test("buildDashboardViewModel preserves server-backed live search results without local re-filtering", () => {
    const categories = [
      createCategory("Tech", [
        createFeedNode("feed-1", "Feed 1", "https://example.com/feed-1.xml"),
      ]),
    ];
    const articles = [
      buildFeedListArticle({
        content: "truncated preview without match",
        id: 20,
        link: "https://example.com/server-match",
        title: "Server matched article",
      }),
    ];

    const viewModel = buildDashboardViewModel({
      articleFilter: "all",
      articleSortOrder: "newest",
      categories,
      collapsingArticleKeys: [],
      customCategoryLabels: [],
      expandedArticleKey: null,
      feed: articles,
      orderedCategoryLabels: ["Tech"],
      searchTerm: "needle",
      selectedCategory: "feed-1",
      useLocalSearch: false,
      usePlaceholderData: false,
    });

    expect(viewModel.filteredFeed).toEqual(articles);
  });

  test("build batch outcomes and resolve batch results through both placeholder and fetch paths", async () => {
    const article = buildFeedListArticle({
      id: 30,
      link: "https://example.com/article",
    });
    const normalizedSources = [
      { name: "Feed 1", url: "https://example.com/1" },
      { name: "Feed 2", url: "https://example.com/2" },
      { name: "Feed 3", url: "https://example.com/3" },
      { name: "Feed 4", url: "https://example.com/4" },
    ];
    const batchResults = [
      {
        articles: [article],
        error: undefined,
        lastFetchedAt: new Date("2024-01-03T00:00:00.000Z"),
        ok: true,
        url: "https://example.com/1",
      },
      {
        articles: [],
        error: "boom",
        lastFetchedAt: new Date("2024-01-02T00:00:00.000Z"),
        ok: false,
        url: "https://example.com/2",
      },
      {
        articles: [],
        error: "boom",
        lastFetchedAt: null,
        ok: false,
        url: "https://example.com/3",
      },
      {
        articles: [],
        error: "boom",
        lastFetchedAt: null,
        ok: false,
        url: "https://example.com/4",
      },
    ] as any;

    const outcome = buildFeedBatchOutcome(
      normalizedSources,
      batchResults,
      false,
      () => [],
    );

    expect(outcome.articles[0]?.feedName).toBe("Feed 1");
    expect(outcome.failedFeeds).toHaveLength(3);
    expect(outcome.newestLastFetchedAt?.toISOString()).toBe(
      "2024-01-03T00:00:00.000Z",
    );
    expect(
      formatFeedFailureLabel(outcome.failedFeeds, outcome.sourceNamesByUrl),
    ).toBe("Feed 2, Feed 3, Feed 4");
    expect(
      formatFeedFailureLabel(
        [...outcome.failedFeeds, { url: "https://example.com/5" } as any],
        new Map([
          ["https://example.com/2", "Feed 2"],
          ["https://example.com/3", "Feed 3"],
          ["https://example.com/4", "Feed 4"],
          ["https://example.com/5", "Feed 5"],
        ]),
      ),
    ).toBe("Feed 2, Feed 3, Feed 4 and 1 more");

    const fetchFeedsBatch = mock(async () => batchResults);
    const getPlaceholderArticles = mock((url: string) => [
      buildFeedListArticle({ id: 40, link: `${url}/placeholder` }),
    ]);

    const placeholderOldestWindow = await resolveFeedBatchResults(
      normalizedSources.slice(0, 2),
      true,
      {
        articleLimit: 2,
        articleSortOrder: "oldest",
      },
      undefined,
      {
        fetchFeedsBatch,
        getPlaceholderArticles: (url: string) =>
          url.endsWith("/1")
            ? [
                buildFeedListArticle({
                  id: 10,
                  link: `${url}/newer`,
                  publicationDate: new Date("2026-03-13T12:00:00.000Z"),
                }),
                buildFeedListArticle({
                  id: 11,
                  link: `${url}/oldest`,
                  publicationDate: new Date("2026-03-13T09:00:00.000Z"),
                }),
              ]
            : [
                buildFeedListArticle({
                  id: 20,
                  link: `${url}/middle`,
                  publicationDate: new Date("2026-03-13T10:00:00.000Z"),
                }),
                buildFeedListArticle({
                  id: 21,
                  link: `${url}/newest`,
                  publicationDate: new Date("2026-03-13T13:00:00.000Z"),
                }),
              ],
      },
    );

    expect(
      placeholderOldestWindow.flatMap((result) =>
        result.articles.map((article) => article.id),
      ),
    ).toEqual([11, 20]);

    expect(
      await resolveFeedBatchResults(
        normalizedSources,
        true,
        undefined,
        undefined,
        {
          fetchFeedsBatch,
          getPlaceholderArticles,
        },
      ),
    ).toEqual([
      {
        articles: [
          expect.objectContaining({
            feedName: "Feed 1",
            feedUrl: "https://example.com/1",
          }),
        ],
        ok: true,
        url: "https://example.com/1",
      },
      {
        articles: [
          expect.objectContaining({
            feedName: "Feed 2",
            feedUrl: "https://example.com/2",
          }),
        ],
        ok: true,
        url: "https://example.com/2",
      },
      {
        articles: [
          expect.objectContaining({
            feedName: "Feed 3",
            feedUrl: "https://example.com/3",
          }),
        ],
        ok: true,
        url: "https://example.com/3",
      },
      {
        articles: [
          expect.objectContaining({
            feedName: "Feed 4",
            feedUrl: "https://example.com/4",
          }),
        ],
        ok: true,
        url: "https://example.com/4",
      },
    ]);

    expect(
      await resolveFeedBatchResults(
        normalizedSources,
        false,
        {
          articleFilter: "unread",
          articleLimit: 25,
          forceRefresh: true,
          forceResolveUpstream: true,
          knownLastFetchedAtByUrl: new Map([
            ["https://example.com/1", new Date("2024-01-01T00:00:00.000Z")],
          ]),
          requestSource: "manual-refresh",
          skipRefresh: true,
        },
        new AbortController().signal,
        {
          fetchFeedsBatch,
          getPlaceholderArticles,
        },
      ),
    ).toBe(batchResults);

    expect(fetchFeedsBatch).toHaveBeenCalled();
  });
});

describe("article sort order utilities and view-model integration", () => {
  test("ARTICLE_SORT_ORDER_OPTIONS exposes newest first then oldest", () => {
    expect(ARTICLE_SORT_ORDER_OPTIONS).toEqual(["newest", "oldest"]);
  });

  test("isArticleSortOrder accepts known orders and rejects everything else", () => {
    expect(isArticleSortOrder("newest")).toBe(true);
    expect(isArticleSortOrder("oldest")).toBe(true);
    expect(isArticleSortOrder("NEWEST")).toBe(false);
    expect(isArticleSortOrder("")).toBe(false);
    expect(isArticleSortOrder(null)).toBe(false);
    expect(isArticleSortOrder(undefined)).toBe(false);
    expect(isArticleSortOrder(0)).toBe(false);
    expect(isArticleSortOrder({})).toBe(false);
  });

  test("sortArticlesByOrder returns newest-first by publication date without mutating input", () => {
    const articles = [
      buildFeedListArticle({
        id: 1,
        publicationDate: new Date("2026-03-13T09:00:00.000Z"),
        title: "A",
      }),
      buildFeedListArticle({
        id: 2,
        publicationDate: new Date("2026-03-13T11:00:00.000Z"),
        title: "B",
      }),
      buildFeedListArticle({
        id: 3,
        publicationDate: new Date("2026-03-13T10:00:00.000Z"),
        title: "C",
      }),
    ];

    const result = sortArticlesByOrder(articles, "newest");

    expect(result).not.toBe(articles);
    expect(result.map((article) => article.id)).toEqual([2, 3, 1]);
    expect(articles.map((article) => article.id)).toEqual([1, 2, 3]);
  });

  test("sortArticlesByOrder returns oldest-first by publication date without mutating input", () => {
    const articles = [
      buildFeedListArticle({
        id: 1,
        publicationDate: new Date("2026-03-13T09:00:00.000Z"),
        title: "A",
      }),
      buildFeedListArticle({
        id: 2,
        publicationDate: new Date("2026-03-13T11:00:00.000Z"),
        title: "B",
      }),
      buildFeedListArticle({
        id: 3,
        publicationDate: new Date("2026-03-13T10:00:00.000Z"),
        title: "C",
      }),
    ];

    const result = sortArticlesByOrder(articles, "oldest");

    expect(result).not.toBe(articles);
    expect(result.map((article) => article.id)).toEqual([1, 3, 2]);
    expect(articles.map((article) => article.id)).toEqual([1, 2, 3]);
  });

  test("sortArticlesByOrder handles empty input for both sort orders", () => {
    expect(sortArticlesByOrder([], "newest")).toEqual([]);
    expect(sortArticlesByOrder([], "oldest")).toEqual([]);
  });

  test("buildDashboardViewModel keeps stale live data aligned with the selected sort order", () => {
    const categories = [
      createCategory("Tech", [
        createFeedNode("feed-1", "Feed 1", "https://example.com/feed-1.xml"),
      ]),
    ];
    const articles = [
      buildFeedListArticle({
        id: 10,
        link: "https://example.com/a",
        publicationDate: new Date("2026-03-13T12:00:00.000Z"),
      }),
      buildFeedListArticle({
        id: 11,
        link: "https://example.com/b",
        publicationDate: new Date("2026-03-13T10:00:00.000Z"),
      }),
      buildFeedListArticle({
        id: 12,
        link: "https://example.com/c",
        publicationDate: new Date("2026-03-13T11:00:00.000Z"),
      }),
    ];

    const viewModel = buildDashboardViewModel({
      articleFilter: "all",
      articleSortOrder: "oldest",
      categories,
      collapsingArticleKeys: [],
      customCategoryLabels: [],
      expandedArticleKey: null,
      feed: articles,
      orderedCategoryLabels: ["Tech"],
      searchTerm: "",
      selectedCategory: "feed-1",
      useLocalSearch: true,
      usePlaceholderData: false,
    });

    expect(viewModel.filteredFeed.map((article) => article.id)).toEqual([
      11, 12, 10,
    ]);
  });

  test("buildDashboardViewModel applies the selected sort order locally in placeholder mode", () => {
    const categories = [
      createCategory("Tech", [
        createFeedNode("feed-1", "Feed 1", "https://example.com/feed-1.xml"),
      ]),
    ];
    const articles = [
      buildFeedListArticle({
        id: 10,
        link: "https://example.com/a",
        publicationDate: new Date("2026-03-13T12:00:00.000Z"),
      }),
      buildFeedListArticle({
        id: 11,
        link: "https://example.com/b",
        publicationDate: new Date("2026-03-13T10:00:00.000Z"),
      }),
      buildFeedListArticle({
        id: 12,
        link: "https://example.com/c",
        publicationDate: new Date("2026-03-13T11:00:00.000Z"),
      }),
    ];

    const viewModel = buildDashboardViewModel({
      articleFilter: "all",
      articleSortOrder: "oldest",
      categories,
      collapsingArticleKeys: [],
      customCategoryLabels: [],
      expandedArticleKey: null,
      feed: articles,
      orderedCategoryLabels: ["Tech"],
      searchTerm: "",
      selectedCategory: "feed-1",
      useLocalSearch: true,
      usePlaceholderData: true,
    });

    expect(viewModel.filteredFeed.map((article) => article.id)).toEqual([
      11, 12, 10,
    ]);
  });
});
