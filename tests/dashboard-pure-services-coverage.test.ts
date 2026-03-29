import { beforeEach, describe, expect, test } from "bun:test";

import type { Article, CategoryTreeNode, FeedSource } from "@/lib";

import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/constants";
import {
  DASHBOARD_PREVIEW_COOKIE_NAME,
  isDashboardPreviewModeEnabled,
  resolveDashboardPreviewMode,
  setDashboardPreviewPersistence,
} from "@/app/dashboard/preview-mode";
import {
  dedupeAndSortArticles,
  getArticleKey,
} from "@/app/dashboard/services/article-collection";
import {
  buildPreview,
  getArticleSourceLabel,
  getRichContentClass,
} from "@/app/dashboard/services/article-content";
import {
  ARTICLE_FILTER_OPTIONS,
  filterArticlesByState,
} from "@/app/dashboard/services/article-filters";
import {
  buildDisplayCategories,
  computeNextOrderedCategoryLabels,
} from "@/app/dashboard/services/category-display";
import { shouldResetExpandedArticle } from "@/app/dashboard/services/dashboard-selection-state";
import {
  buildBatchRequestSignature,
  mapFeedNodesToBatchSources,
  normalizeFeedBatchSources,
} from "@/app/dashboard/services/feed-batch";
import {
  buildFeedBatchOutcome,
  formatFeedFailureLabel,
} from "@/app/dashboard/services/feed-batch-outcome";
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
import { loadFeedSourceTree } from "@/app/dashboard/services/feed-source-tree";
import {
  getFeedBatchQueryKey,
  getFeedSourceTreeQueryKey,
} from "@/app/dashboard/services/query-keys";
import {
  AUTO_REFRESH_INTERVAL_STORAGE_KEY,
  MANUAL_REFRESH_INTERVAL_MINUTES,
  MIN_AUTO_REFRESH_INTERVAL_MINUTES,
  normalizeAutoRefreshIntervalMinutes,
  resolveDefaultAutoRefreshIntervalMinutes,
  toAutoRefreshIntervalMs,
} from "@/app/dashboard/services/refresh-policy";
import {
  collectFullyVisibleArticleKeys,
  collectFullyVisibleUnreadArticles,
  findDashboardFeedViewport,
} from "@/app/dashboard/services/viewport-read";

describe("dashboard pure services coverage", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.cookie = `${DASHBOARD_PREVIEW_COOKIE_NAME}=; Max-Age=0; Path=/`;
  });

  test("covers refresh policy normalization and conversion", () => {
    expect(AUTO_REFRESH_INTERVAL_STORAGE_KEY).toContain("autoRefreshIntervalMinutes");
    expect(MANUAL_REFRESH_INTERVAL_MINUTES).toBe(5);
    expect(MIN_AUTO_REFRESH_INTERVAL_MINUTES).toBe(30);
    expect(normalizeAutoRefreshIntervalMinutes(Number.NaN)).toBe(30);
    expect(normalizeAutoRefreshIntervalMinutes(12.4, 45.6)).toBe(30);
    expect(normalizeAutoRefreshIntervalMinutes(Number.POSITIVE_INFINITY, 45.6)).toBe(46);
    expect(resolveDefaultAutoRefreshIntervalMinutes(89.8)).toBe(90);
    expect(toAutoRefreshIntervalMs(44.2)).toBe(44 * 60_000);
  });

  test("covers dashboard query key builders", () => {
    const knownLastFetchedAtByUrl = new Map<string, Date>([
      ["https://a.example/feed.xml", new Date("2024-01-01T00:00:00.000Z")],
      ["https://z.example/feed.xml", new Date("2024-01-02T00:00:00.000Z")],
    ]);

    expect(getFeedBatchQueryKey("signature-1")).toEqual([
      "dashboard",
      "feed-batch",
      "signature-1",
      "all",
      "refresh",
      "",
    ]);
    expect(
      getFeedBatchQueryKey("signature-2", {
        articleFilter: "starred",
        knownLastFetchedAtByUrl,
        skipRefresh: true,
      }),
    ).toEqual([
      "dashboard",
      "feed-batch",
      "signature-2",
      "starred",
      "skip-refresh",
      "https://a.example/feed.xml@2024-01-01T00:00:00.000Z|https://z.example/feed.xml@2024-01-02T00:00:00.000Z",
    ]);
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

  test("covers article collection helpers", () => {
    const olderShort = buildArticle({
      content: "short",
      id: 1,
      link: " https://example.com/article ",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    });
    const newerLong = buildArticle({
      content: "much longer article content",
      id: 2,
      link: "https://example.com/article",
      publicationDate: new Date("2024-01-02T00:00:00.000Z"),
    });
    const newestDistinct = buildArticle({
      id: 3,
      link: "https://example.com/newest",
      publicationDate: new Date("2024-01-03T00:00:00.000Z"),
      title: "Newest",
    });
    const blankLink = buildArticle({ id: 4, link: "   " });

    expect(getArticleKey(olderShort)).toBe("https://example.com/article");
    expect(
      dedupeAndSortArticles([olderShort, newestDistinct, newerLong, blankLink]),
    ).toEqual([newestDistinct, newerLong]);
  });

  test("covers article content helpers", () => {
    const shortPreview = buildPreview("Paragraph one.\n\nParagraph two.");
    const longPreview = buildPreview(
      Array.from({ length: 60 }, (_, index) => `word-${index}`).join("   "),
    );

    expect(shortPreview).toEqual({
      hasOverflow: false,
      preview: "Paragraph one. Paragraph two.",
    });
    expect(longPreview.hasOverflow).toBe(true);
    expect(longPreview.preview.length).toBeLessThanOrEqual(170);
    expect(getArticleSourceLabel(buildArticle({ feedName: "Example Feed" }))).toBe(
      "Example Feed",
    );
    expect(
      getArticleSourceLabel(
        buildArticle({
          feedName: undefined,
          feedUrl: "https://www.example.com/feed.xml",
          link: "https://fallback.example.com/article",
        }),
      ),
    ).toBe("example.com");
    expect(getRichContentClass(true)).toContain("text-[0.97rem]");
    expect(getRichContentClass(false)).toContain("text-[0.91rem]");
  });

  test("covers article filter variants", () => {
    const unread = buildArticle({ id: 1, isRead: false, link: "https://example.com/unread" });
    const read = buildArticle({ id: 2, isRead: true, link: "https://example.com/read" });
    const starred = buildArticle({ id: 3, isRead: true, isStarred: true, link: "https://example.com/starred" });

    expect(ARTICLE_FILTER_OPTIONS).toEqual(["all", "unread", "read", "starred"]);
    expect(filterArticlesByState([unread, read, starred], "all", null, [])).toHaveLength(3);
    expect(filterArticlesByState([unread, read, starred], "read", null, [])).toEqual([
      read,
      starred,
    ]);
    expect(filterArticlesByState([unread, read, starred], "starred", null, [])).toEqual([
      starred,
    ]);
    expect(
      filterArticlesByState([unread, read, starred], "unread", starred.link.trim(), [
        read.link.trim(),
      ]),
    ).toEqual([unread, read, starred]);
  });

  test("covers category display helpers", () => {
    const categories = [
      buildCategoryNode("News", "feed-news", "https://example.com/news.xml"),
      buildCategoryNode("Science", "feed-science", "https://example.com/science.xml"),
    ];

    expect(
      buildDisplayCategories(categories, ["Opinion"], ["Opinion", "Science", "News"]),
    ).toEqual([
      { children: [], key: "cat-opinion", label: "Opinion" },
      categories[1],
      categories[0],
    ]);
    expect(
      computeNextOrderedCategoryLabels(categories, ["Opinion"], ["Science", "Missing"]),
    ).toEqual(["Science", "News", "Opinion"]);
  });

  test("covers feed batch mapping helpers", () => {
    const article = buildArticle({
      id: 21,
      link: "https://example.com/article-21",
      publicationDate: new Date("2024-01-03T00:00:00.000Z"),
    });
    const placeholderArticle = buildArticle({
      id: 22,
      link: "https://placeholder.example.com/article-22",
      publicationDate: new Date("2024-01-02T00:00:00.000Z"),
    });
    const normalizedSources = [
      { name: "Primary Feed", url: "https://example.com/feed.xml" },
      { name: "Fallback Feed", url: "https://fallback.example.com/feed.xml" },
    ];
    const batchResults = [
      {
        articles: [article],
        lastFetchedAt: new Date("2024-01-03T12:00:00.000Z"),
        ok: true,
        url: normalizedSources[0].url,
      },
      {
        articles: [],
        error: "offline",
        lastFetchedAt: new Date("2024-01-02T12:00:00.000Z"),
        ok: false,
        url: normalizedSources[1].url,
      },
    ];

    expect(buildBatchRequestSignature(normalizedSources)).toBe(
      "https://example.com/feed.xml|https://fallback.example.com/feed.xml",
    );
    expect(
      normalizeFeedBatchSources([
        normalizedSources[0],
        normalizedSources[0],
        { name: "", url: "" },
        normalizedSources[1],
      ]),
    ).toEqual(normalizedSources);
    expect(
      mapFeedNodesToBatchSources([
        buildLeafNode("Feed One", "feed-1", "https://example.com/feed.xml"),
        buildLeafNode("Disabled", "feed-2", "https://example.com/off.xml", false),
        { children: [], key: "no-url", label: "No URL" },
      ]),
    ).toEqual([{ name: "Feed One", url: "https://example.com/feed.xml" }]);

    const outcome = buildFeedBatchOutcome(
      normalizedSources,
      batchResults,
      true,
      (url) => (url === normalizedSources[1].url ? [placeholderArticle] : []),
    );

    expect(outcome.failedFeeds).toEqual([batchResults[1]]);
    expect(outcome.newestLastFetchedAt).toEqual(batchResults[0].lastFetchedAt);
    expect(outcome.sourceNamesByUrl.get(normalizedSources[0].url)).toBe("Primary Feed");
    expect(outcome.articles.map((currentArticle) => currentArticle.feedUrl)).toEqual([
      normalizedSources[0].url,
      normalizedSources[1].url,
    ]);
    expect(formatFeedFailureLabel(outcome.failedFeeds, outcome.sourceNamesByUrl)).toBe(
      "Fallback Feed",
    );
    expect(
      formatFeedFailureLabel(
        [batchResults[1], batchResults[1], batchResults[1], batchResults[1]],
        new Map([[normalizedSources[1].url, "Fallback Feed"]]),
      ),
    ).toBe("Fallback Feed, Fallback Feed, Fallback Feed and 1 more");
  });

  test("covers feed loader stale-time helpers", () => {
    const queryKey = getFeedBatchQueryKey("sig");
    const queryClient = {
      getQueryState: () => ({
        dataUpdatedAt: Date.now() - 1_000,
        status: "success",
      }),
    };

    expect(isFreshFeedBatchQuery(queryClient, queryKey, 45_000)).toBe(true);
    expect(isFreshFeedBatchQuery(queryClient, queryKey, 0)).toBe(false);
    expect(
      isFreshFeedBatchQuery(
        { getQueryState: () => ({ dataUpdatedAt: Date.now(), status: "error" }) },
        queryKey,
        45_000,
      ),
    ).toBe(false);
    expect(resolveFeedBatchStaleTime({ forceRefresh: true })).toBe(0);
    expect(resolveFeedBatchStaleTime({ skipRefresh: true })).toBe(60_000);
    expect(resolveFeedBatchStaleTime({ requestSource: "auto-refresh" })).toBe(0);
    expect(resolveFeedBatchStaleTime({ requestSource: "manual-refresh" })).toBe(0);
    expect(resolveFeedBatchStaleTime()).toBe(45_000);
    expect(shouldNotifyFeedFailureToast({ skipRefresh: true })).toBe(false);
    expect(shouldNotifyFeedFailureToast(undefined, true)).toBe(false);
    expect(shouldNotifyFeedFailureToast()).toBe(true);
  });

  test("covers feed source tree loading branches", async () => {
    const defaultCategories = [buildCategoryNode("Default", "default-feed", "https://example.com/default.xml")];
    const sourceCategories = [buildCategoryNode("Sources", "source-feed", "https://example.com/source.xml")];
    let getFeedSourcesCalls = 0;

    const dependencies = {
      buildCategoriesFromSources: (sources: FeedSource[]) => {
        expect(sources).toHaveLength(1);
        return sourceCategories;
      },
      buildDefaultCategories: (usePlaceholderData: boolean) =>
        usePlaceholderData ? [...defaultCategories, buildCategoryNode("Preview", "preview-feed", "https://example.com/preview.xml")] : defaultCategories,
      getFeedSources: async () => {
        getFeedSourcesCalls += 1;
        return [{ id: 1, name: "Example", url: "https://example.com/feed.xml" }];
      },
    };

    expect(await loadFeedSourceTree(true, dependencies)).toHaveLength(2);
    expect(getFeedSourcesCalls).toBe(0);
    expect(await loadFeedSourceTree(false, dependencies)).toEqual(sourceCategories);
    expect(
      await loadFeedSourceTree(false, {
        ...dependencies,
        getFeedSources: async () => [],
      }),
    ).toEqual(defaultCategories);
    expect(
      await loadFeedSourceTree(false, {
        ...dependencies,
        getFeedSources: async () => {
          throw new Error("boom");
        },
      }),
    ).toEqual(defaultCategories);
  });

  test("covers feed source selection helpers", () => {
    const categories = [
      buildCategoryNode("News", "feed-news", "https://example.com/news.xml"),
      buildCategoryNode("Science", "feed-science", "https://example.com/science.xml"),
    ];

    expect(normalizeFeedSourceInput(" Example Feed ", " https://example.com/feed.xml ")).toEqual({
      name: "Example Feed",
      url: "https://example.com/feed.xml",
    });
    expect(
      resolvePostEnabledToggleSelection(categories, "feed-news", undefined, false, "feed-news"),
    ).toEqual({ nextSelectedCategory: ALL_FEEDS_NODE_KEY, type: "all-feeds" });
    expect(
      resolvePostEnabledToggleSelection(
        categories,
        "feed-news",
        "https://example.com/science.xml",
        true,
        "feed-science",
      ),
    ).toEqual({ feedUrl: "https://example.com/science.xml", type: "feed" });
    expect(
      resolvePostEnabledToggleSelection(categories, "feed-news", undefined, true, "feed-news"),
    ).toEqual({ type: "none" });
    expect(resolvePostRemovalSelection([], "feed-news", "feed-news")).toEqual({
      type: "clear",
    });
    expect(
      resolvePostRemovalSelection(categories, "feed-news", "feed-news"),
    ).toEqual({
      feedUrl: "https://example.com/news.xml",
      nextSelectedCategory: "feed-news",
      type: "feed",
    });
    expect(
      resolvePostRemovalSelection(categories, "feed-science", "feed-news"),
    ).toEqual({ feedUrl: "https://example.com/science.xml", type: "feed" });
    expect(
      resolvePostRemovalSelection(
        [{ children: [], key: "category-news", label: "News" }, ...categories],
        "category-news",
        "feed-other",
      ),
    ).toEqual({ categoryNode: { children: [], key: "category-news", label: "News" }, type: "category" });
    expect(
      resolvePostRemovalSelection([{ children: [], key: "empty", label: "Empty" }], "missing", "feed-other"),
    ).toEqual({ type: "clear" });
  });

  test("covers dashboard preview mode helpers", () => {
    expect(isDashboardPreviewModeEnabled("1")).toBe(true);
    expect(isDashboardPreviewModeEnabled(undefined)).toBe(false);
    expect(
      resolveDashboardPreviewMode({ cookieValue: null, hasPreviewQuery: true }),
    ).toBe(true);
    expect(
      resolveDashboardPreviewMode({ cookieValue: "1", hasPreviewQuery: false }),
    ).toBe(true);
    setDashboardPreviewPersistence(true);
    setDashboardPreviewPersistence(false);
    expect(typeof document.cookie).toBe("string");
  });

  test("covers expanded-article reset logic", () => {
    expect(
      shouldResetExpandedArticle({
        articleFilter: "all",
        previousArticleFilter: "all",
        previousSelectedCategory: "news",
        selectedCategory: "science",
      }),
    ).toBe(true);
    expect(
      shouldResetExpandedArticle({
        articleFilter: "starred",
        previousArticleFilter: "all",
        previousSelectedCategory: "news",
        selectedCategory: "news",
      }),
    ).toBe(true);
    expect(
      shouldResetExpandedArticle({
        articleFilter: "all",
        previousArticleFilter: "all",
        previousSelectedCategory: "news",
        selectedCategory: "news",
      }),
    ).toBe(false);
  });

  test("covers viewport-based visible article helpers", () => {
    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(0, 0, 200, 200);

    const visibleArticleElement = document.createElement("article");
    visibleArticleElement.dataset.articleKey = "https://example.com/visible";
    visibleArticleElement.getBoundingClientRect = () => createRect(10, 10, 190, 190);

    const clippedArticleElement = document.createElement("article");
    clippedArticleElement.dataset.articleKey = "https://example.com/clipped";
    clippedArticleElement.getBoundingClientRect = () => createRect(-10, 10, 190, 190);

    viewport.append(visibleArticleElement, clippedArticleElement);
    document.body.append(viewport);

    expect(findDashboardFeedViewport()).toBe(viewport);
    expect(collectFullyVisibleArticleKeys(viewport)).toEqual([
      "https://example.com/visible",
    ]);
    expect(
      collectFullyVisibleUnreadArticles(
        [
          buildArticle({ id: 1, isRead: false, link: "https://example.com/visible" }),
          buildArticle({ id: 2, isRead: true, link: "https://example.com/clipped" }),
        ],
        viewport,
      ),
    ).toEqual([
      buildArticle({ id: 1, isRead: false, link: "https://example.com/visible" }),
    ]);
    expect(collectFullyVisibleUnreadArticles([], null)).toEqual([]);
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

function buildCategoryNode(
  label: string,
  feedKey: string,
  url: string,
): CategoryTreeNode {
  return {
    children: [buildLeafNode(`${label} Feed`, feedKey, url)],
    key: `category:${label.toLowerCase()}`,
    label,
  };
}

function buildLeafNode(
  label: string,
  key: string,
  url: string,
  enabled = true,
): CategoryTreeNode {
  return {
    children: [],
    data: { enabled, url },
    key,
    label,
  };
}

function createRect(
  top: number,
  left: number,
  right: number,
  bottom: number,
): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    toJSON: () => ({}),
    top,
    width: right - left,
    x: left,
    y: top,
  } as DOMRect;
}