import { describe, expect, mock, test } from "bun:test";

import {
  dedupeAndSortArticles,
  getArticleKey,
} from "@/app/dashboard/services/article-collection";
import { filterArticlesByState } from "@/app/dashboard/services/article-filters";
import {
  buildDisplayCategories,
  computeNextOrderedCategoryLabels,
} from "@/app/dashboard/services/category-display";
import {
  buildDashboardControllerState,
  buildDashboardSidebarContentProps,
} from "@/app/dashboard/services/dashboard-controller-state";
import {
  buildDashboardViewModel,
  filterArticlesBySearchTerm,
} from "@/app/dashboard/services/dashboard-view-model";
import {
  buildFeedBatchOutcome,
  formatFeedFailureLabel,
} from "@/app/dashboard/services/feed-batch-outcome";
import { resolveFeedBatchResults } from "@/app/dashboard/services/feed-batch-resolver";

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
    expect(dedupeAndSortArticles([blank, olderShort, newerLong, newest])).toEqual([
      newest,
      newerLong,
    ]);
  });

  test("filter articles by dashboard state", () => {
    const unread = buildFeedListArticle({ id: 10, isRead: false, link: "https://example.com/u" });
    const read = buildFeedListArticle({ id: 11, isRead: true, link: "https://example.com/r" });
    const starred = buildFeedListArticle({ id: 12, isRead: true, isStarred: true, link: "https://example.com/s" });
    const articles = [unread, read, starred];

    expect(filterArticlesByState(articles, "all", null, [])).toEqual(articles);
    expect(filterArticlesByState(articles, "read", null, [])).toEqual([read, starred]);
    expect(filterArticlesByState(articles, "starred", null, [])).toEqual([starred]);
    expect(filterArticlesByState(articles, "unread", null, [])).toEqual([unread]);
    expect(filterArticlesByState(articles, "unread", read.link, [])).toEqual([unread, read]);
    expect(filterArticlesByState(articles, "unread", null, [starred.link])).toEqual([
      unread,
      starred,
    ]);
  });

  test("build display categories and preserve ordered category labels", () => {
    const tech = createCategory("Tech", [createFeedNode("feed-1", "Feed 1", "https://example.com/1")]);
    const news = createCategory("News", [createFeedNode("feed-2", "Feed 2", "https://example.com/2")]);

    expect(
      buildDisplayCategories([tech], ["Custom"], ["Custom", "Tech"]),
    ).toEqual([
      { children: [], key: "cat-custom", label: "Custom" },
      tech,
    ]);

    expect(
      computeNextOrderedCategoryLabels([tech, news], ["Custom"], ["News", "Missing", "Tech"]),
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

  test("build the dashboard view model and search filters from current selection state", () => {
    const enabledFeed = createFeedNode("feed-1", "Feed 1", "https://example.com/1");
    const disabledFeed = createFeedNode("feed-2", "Feed 2", "https://example.com/2", false);
    const categories = [
      createCategory("Tech", [enabledFeed]),
      createCategory("Disabled", [disabledFeed]),
      createCategory("Empty", []),
    ];
    const articles = [
      buildFeedListArticle({
        content: "secondary body",
        id: 20,
        link: "https://example.com/title",
        title: "Needle title",
      }),
      buildFeedListArticle({
        content: "contains special search needle",
        id: 21,
        link: "https://example.com/body",
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
      categories,
      collapsingArticleKeys: [],
      customCategoryLabels: ["Custom"],
      expandedArticleKey: null,
      feed: articles,
      orderedCategoryLabels: ["Custom", "Tech", "Disabled"],
      searchTerm: "needle",
      selectedCategory: "feed-2",
    });

    expect(viewModel.filteredFeed.map((article) => article.link)).toEqual([
      "https://example.com/title",
      "https://example.com/body",
    ]);
    expect(viewModel.displayCategories.map((category) => category.label)).toEqual([
      "Custom",
      "Tech",
      "Disabled",
    ]);
    expect(viewModel.sidebarCategories.map((category) => category.label)).toEqual([
      "All Feeds",
      "Tech",
    ]);
    expect(viewModel.selectedFeed).toBe("Feed 2");
    expect(viewModel.selectedFeedUrl).toBeUndefined();
  });

  test("build batch outcomes and resolve batch results through both placeholder and fetch paths", async () => {
    const article = buildFeedListArticle({ id: 30, link: "https://example.com/article" });
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
    expect(outcome.newestLastFetchedAt?.toISOString()).toBe("2024-01-03T00:00:00.000Z");
    expect(formatFeedFailureLabel(outcome.failedFeeds, outcome.sourceNamesByUrl)).toBe(
      "Feed 2, Feed 3, Feed 4",
    );
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

    expect(
      await resolveFeedBatchResults(normalizedSources, true, undefined, undefined, {
        fetchFeedsBatch,
        getPlaceholderArticles,
      }),
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
          knownLastFetchedAtByUrl: new Map([["https://example.com/1", new Date("2024-01-01T00:00:00.000Z")]]),
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