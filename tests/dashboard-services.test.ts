/**
 * Component Tests: Dashboard Services
 * Tests for src/app/dashboard/services/
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  buildPreview,
  getArticleSourceLabel,
  getRichContentClass,
} from "@/app/dashboard/dashboard-services/article";
import {
  dedupeAndSortArticles,
  getArticleKey,
} from "@/app/dashboard/dashboard-services/article-collection";
import { filterArticlesBySearchTerm } from "@/app/dashboard/dashboard-services/dashboard-state";
import {
  buildFeedBatchOutcome,
  formatFeedFailureLabel,
  loadFeedSourceTree,
  resolveFeedBatchResults,
} from "@/app/dashboard/dashboard-services/feed-data";
import { collectFullyVisibleUnreadArticles } from "@/app/dashboard/dashboard-services/feed-view-model";

// ─── Article Content Services ─────────────────────────────────────────────────

describe("article-content services", () => {
  test("getUrlHostnameDisplayLabel extracts hostname", async () => {
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameDisplayLabel("https://www.example.com/path")).toBe(
      "example.com",
    );
    expect(getUrlHostnameDisplayLabel("http://subdomain.example.com")).toBe(
      "subdomain.example.com",
    );
  });

  test("getUrlHostnameDisplayLabel removes www prefix", async () => {
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameDisplayLabel("https://www.example.com")).toBe(
      "example.com",
    );
  });

  test("getUrlHostnameDisplayLabel handles invalid URLs", async () => {
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameDisplayLabel("not-a-url")).toBe("not-a-url");
  });
});

describe("dashboard-view-model search filtering", () => {
  test("returns the same array when the search term is blank", () => {
    const articles = [
      {
        content: "Alpha body",
        feedId: 1,
        id: 1,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
        link: "https://example.com/a",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        title: "Alpha",
      },
    ];

    expect(filterArticlesBySearchTerm(articles, "   ")).toBe(articles);
  });

  test("matches against article title and content case-insensitively", () => {
    const articles = [
      {
        content: "Gamma body",
        feedId: 1,
        id: 1,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
        link: "https://example.com/a",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        title: "Alpha",
      },
      {
        content: "Delta body",
        feedId: 1,
        id: 2,
        lastChecked: new Date("2024-01-02T00:00:00.000Z"),
        link: "https://example.com/b",
        publicationDate: new Date("2024-01-02T00:00:00.000Z"),
        title: "Beta",
      },
    ];

    expect(filterArticlesBySearchTerm(articles, "alpha")).toEqual([
      articles[0],
    ]);
    expect(filterArticlesBySearchTerm(articles, "DELTA")).toEqual([
      articles[1],
    ]);
  });
});

describe("viewport-read services", () => {
  test("returns only unread articles that are fully contained in the viewport", () => {
    const viewport = document.createElement("div");
    const articles = [
      {
        content: "A",
        feedId: 1,
        id: 1,
        isRead: false,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
        link: "https://example.com/a",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        title: "A",
      },
      {
        content: "B",
        feedId: 1,
        id: 2,
        isRead: false,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
        link: "https://example.com/b",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        title: "B",
      },
      {
        content: "C",
        feedId: 1,
        id: 3,
        isRead: true,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
        link: "https://example.com/c",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        title: "C",
      },
    ];

    viewport.getBoundingClientRect = mock(() => ({
      bottom: 500,
      height: 400,
      left: 0,
      right: 800,
      toJSON: () => ({}),
      top: 100,
      width: 800,
      x: 0,
      y: 100,
    })) as typeof viewport.getBoundingClientRect;

    const fullyVisibleArticle = document.createElement("article");
    fullyVisibleArticle.dataset.articleKey = "https://example.com/a";
    fullyVisibleArticle.getBoundingClientRect = mock(() => ({
      bottom: 240,
      height: 120,
      left: 0,
      right: 780,
      toJSON: () => ({}),
      top: 120,
      width: 780,
      x: 0,
      y: 120,
    })) as typeof fullyVisibleArticle.getBoundingClientRect;

    const clippedArticle = document.createElement("article");
    clippedArticle.dataset.articleKey = "https://example.com/b";
    clippedArticle.getBoundingClientRect = mock(() => ({
      bottom: 520,
      height: 140,
      left: 0,
      right: 780,
      toJSON: () => ({}),
      top: 380,
      width: 780,
      x: 0,
      y: 380,
    })) as typeof clippedArticle.getBoundingClientRect;

    const readArticle = document.createElement("article");
    readArticle.dataset.articleKey = "https://example.com/c";
    readArticle.getBoundingClientRect = mock(() => ({
      bottom: 340,
      height: 120,
      left: 0,
      right: 780,
      toJSON: () => ({}),
      top: 220,
      width: 780,
      x: 0,
      y: 220,
    })) as typeof readArticle.getBoundingClientRect;

    viewport.append(fullyVisibleArticle, clippedArticle, readArticle);

    expect(collectFullyVisibleUnreadArticles(articles, viewport)).toEqual([
      articles[0],
    ]);
  });

  test("excludes unread articles whose ancestor has data-article-entering=true", () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = mock(() => ({
      bottom: 500,
      height: 500,
      left: 0,
      right: 780,
      toJSON: () => ({}),
      top: 0,
      width: 780,
      x: 0,
      y: 0,
    })) as typeof viewport.getBoundingClientRect;

    const articles = [
      {
        content: "A",
        feedId: 1,
        id: 1,
        isRead: false,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
        link: "https://example.com/entering",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        title: "Entering",
      },
      {
        content: "B",
        feedId: 1,
        id: 2,
        isRead: false,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
        link: "https://example.com/settled",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        title: "Settled",
      },
    ];

    // Wrap the entering article inside an ancestor with the entering attribute.
    const enteringRow = document.createElement("div");
    enteringRow.dataset.articleEntering = "true";
    const enteringArticleEl = document.createElement("article");
    enteringArticleEl.dataset.articleKey = "https://example.com/entering";
    enteringArticleEl.getBoundingClientRect = mock(() => ({
      bottom: 120,
      height: 120,
      left: 0,
      right: 780,
      toJSON: () => ({}),
      top: 0,
      width: 780,
      x: 0,
      y: 0,
    })) as typeof enteringArticleEl.getBoundingClientRect;
    enteringRow.append(enteringArticleEl);

    const settledArticleEl = document.createElement("article");
    settledArticleEl.dataset.articleKey = "https://example.com/settled";
    settledArticleEl.getBoundingClientRect = mock(() => ({
      bottom: 240,
      height: 120,
      left: 0,
      right: 780,
      toJSON: () => ({}),
      top: 120,
      width: 780,
      x: 0,
      y: 120,
    })) as typeof settledArticleEl.getBoundingClientRect;

    viewport.append(enteringRow, settledArticleEl);

    // Only the settled article is returned; the entering one is excluded.
    expect(collectFullyVisibleUnreadArticles(articles, viewport)).toEqual([
      articles[1],
    ]);
  });
});

describe("feed-batch-resolver", () => {
  test("returns placeholder batch results without calling the API", async () => {
    const fetchFeedsBatch = mock(async () => {
      throw new Error("placeholder mode should not call the API");
    });
    const placeholderArticle = {
      content: "Preview",
      feedId: 1,
      id: 1,
      lastChecked: new Date("2024-01-01T00:00:00.000Z"),
      link: "https://example.com/article",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
      title: "Placeholder Article",
    };

    const results = await resolveFeedBatchResults(
      [{ name: "Example Feed", url: "https://example.com/feed.xml" }],
      true,
      undefined,
      undefined,
      {
        fetchFeedsBatch,
        getPlaceholderArticles: () => [placeholderArticle],
      },
    );

    expect(fetchFeedsBatch).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        articles: [
          {
            ...placeholderArticle,
            feedName: "Example Feed",
            feedUrl: "https://example.com/feed.xml",
          },
        ],
        ok: true,
        url: "https://example.com/feed.xml",
      },
    ]);
  });

  test("applies placeholder article filters and limits before returning preview results", async () => {
    const fetchFeedsBatch = mock(async () => {
      throw new Error("placeholder mode should not call the API");
    });
    const placeholderArticles = [
      {
        content: "Read article",
        feedId: 1,
        id: 1,
        isRead: true,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
        link: "https://example.com/read",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        title: "Read Placeholder",
      },
      {
        content: "Unread article",
        feedId: 1,
        id: 2,
        isRead: false,
        lastChecked: new Date("2024-01-02T00:00:00.000Z"),
        link: "https://example.com/unread",
        publicationDate: new Date("2024-01-02T00:00:00.000Z"),
        title: "Unread Placeholder",
      },
    ];

    const results = await resolveFeedBatchResults(
      [{ name: "Example Feed", url: "https://example.com/feed.xml" }],
      true,
      { articleFilter: "read", articleLimit: 1 },
      undefined,
      {
        fetchFeedsBatch,
        getPlaceholderArticles: () => placeholderArticles,
      },
    );

    expect(fetchFeedsBatch).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        articles: [
          {
            ...placeholderArticles[0],
            feedName: "Example Feed",
            feedUrl: "https://example.com/feed.xml",
          },
        ],
        ok: true,
        url: "https://example.com/feed.xml",
      },
    ]);
  });

  test("applies placeholder article limits globally across multiple feed sources", async () => {
    const fetchFeedsBatch = mock(async () => {
      throw new Error("placeholder mode should not call the API");
    });
    const primaryFeedUrl = "https://example.com/primary.xml";
    const secondaryFeedUrl = "https://example.com/secondary.xml";
    const placeholderArticlesByUrl: Record<
      string,
      {
        content: string;
        feedId: number;
        id: number;
        isRead: boolean;
        lastChecked: Date;
        link: string;
        publicationDate: Date;
        title: string;
      }[]
    > = {
      [primaryFeedUrl]: [
        {
          content: "Newest global article",
          feedId: 1,
          id: 10,
          isRead: false,
          lastChecked: new Date("2024-01-03T00:00:00.000Z"),
          link: "https://example.com/primary/newest",
          publicationDate: new Date("2024-01-03T00:00:00.000Z"),
          title: "Primary Newest",
        },
        {
          content: "Older primary article",
          feedId: 1,
          id: 9,
          isRead: false,
          lastChecked: new Date("2024-01-01T00:00:00.000Z"),
          link: "https://example.com/primary/older",
          publicationDate: new Date("2024-01-01T00:00:00.000Z"),
          title: "Primary Older",
        },
      ],
      [secondaryFeedUrl]: [
        {
          content: "Second newest global article",
          feedId: 2,
          id: 8,
          isRead: false,
          lastChecked: new Date("2024-01-02T00:00:00.000Z"),
          link: "https://example.com/secondary/newer",
          publicationDate: new Date("2024-01-02T00:00:00.000Z"),
          title: "Secondary Newer",
        },
      ],
    };

    const results = await resolveFeedBatchResults(
      [
        { name: "Primary Feed", url: primaryFeedUrl },
        { name: "Secondary Feed", url: secondaryFeedUrl },
      ],
      true,
      { articleFilter: "all", articleLimit: 2 },
      undefined,
      {
        fetchFeedsBatch,
        getPlaceholderArticles: (url) => placeholderArticlesByUrl[url] ?? [],
      },
    );

    expect(fetchFeedsBatch).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        articles: [
          {
            ...placeholderArticlesByUrl[primaryFeedUrl][0],
            feedName: "Primary Feed",
            feedUrl: primaryFeedUrl,
          },
        ],
        ok: true,
        url: primaryFeedUrl,
      },
      {
        articles: [
          {
            ...placeholderArticlesByUrl[secondaryFeedUrl][0],
            feedName: "Secondary Feed",
            feedUrl: secondaryFeedUrl,
          },
        ],
        ok: true,
        url: secondaryFeedUrl,
      },
    ]);
  });

  test("passes normalized URLs and fetch options through to the batch API", async () => {
    const signal = new AbortController().signal;
    const batchResults = [
      {
        articles: [],
        error: "temporary upstream failure",
        ok: false,
        url: "https://example.com/feed.xml",
      },
    ];
    const fetchFeedsBatch = mock(async () => batchResults);

    const results = await resolveFeedBatchResults(
      [{ name: "Example Feed", url: "https://example.com/feed.xml" }],
      false,
      {
        forceRefresh: true,
        forceResolveUpstream: true,
        requestSource: "manual-refresh",
        skipRefresh: true,
      },
      signal,
      {
        fetchFeedsBatch,
        getPlaceholderArticles: () => [],
      },
    );

    expect(fetchFeedsBatch).toHaveBeenCalledWith(
      ["https://example.com/feed.xml"],
      {
        forceRefresh: true,
        forceResolveUpstream: true,
        requestSource: "manual-refresh",
        signal,
        skipRefresh: true,
      },
    );
    expect(results).toBe(batchResults);
  });
});

describe("feed-source-tree", () => {
  test("returns placeholder defaults without loading feed sources", async () => {
    const getFeedSources = mock(async () => {
      throw new Error("placeholder mode should not fetch feed sources");
    });
    const placeholderCategories = [{ key: "demo", label: "Demo" }];

    const result = await loadFeedSourceTree(true, {
      buildCategoriesFromSources: mock(() => []),
      buildDefaultCategories: mock(() => placeholderCategories as never),
      getFeedSources,
    });

    expect(getFeedSources).not.toHaveBeenCalled();
    expect(result).toBe(placeholderCategories);
  });

  test("maps fetched feed sources into categories", async () => {
    const feedSources = [
      { id: 1, name: "Feed", url: "https://example.com/feed.xml" },
    ];
    const categories = [{ key: "feed:1", label: "Feed" }];

    const result = await loadFeedSourceTree(false, {
      buildCategoriesFromSources: mock(() => categories as never),
      buildDefaultCategories: mock(() => []),
      getFeedSources: mock(async () => feedSources as never),
    });

    expect(result).toBe(categories);
  });

  test("falls back to defaults when feed source loading fails", async () => {
    const fallbackCategories = [{ key: "all", label: "All Feeds" }];

    const result = await loadFeedSourceTree(false, {
      buildCategoriesFromSources: mock(() => []),
      buildDefaultCategories: mock(() => fallbackCategories as never),
      getFeedSources: mock(async () => {
        throw new Error("network down");
      }),
    });

    expect(result).toBe(fallbackCategories);
  });
});

describe("feed-batch-outcome", () => {
  test("builds enriched articles and tracks the newest fetch time", () => {
    const timestamp = new Date("2024-01-02T00:00:00.000Z");

    const outcome = buildFeedBatchOutcome(
      [{ name: "Example Feed", url: "https://example.com/feed.xml" }],
      [
        {
          articles: [
            {
              content: "Preview",
              feedId: 1,
              id: 1,
              lastChecked: timestamp,
              link: "https://example.com/article",
              publicationDate: timestamp,
              title: "Article",
            },
          ],
          lastFetchedAt: timestamp,
          ok: true,
          url: "https://example.com/feed.xml",
        },
      ],
      false,
      () => [],
    );

    expect(outcome.newestLastFetchedAt).toEqual(timestamp);
    expect(outcome.failedFeeds).toEqual([]);
    expect(outcome.articles).toEqual([
      {
        content: "Preview",
        feedId: 1,
        feedName: "Example Feed",
        feedUrl: "https://example.com/feed.xml",
        id: 1,
        lastChecked: timestamp,
        link: "https://example.com/article",
        publicationDate: timestamp,
        title: "Article",
      },
    ]);
  });

  test("formats a compact failure label for long upstream failure lists", () => {
    const failureLabel = formatFeedFailureLabel(
      [
        { articles: [], error: "down", ok: false, url: "https://one.example" },
        { articles: [], error: "down", ok: false, url: "https://two.example" },
        {
          articles: [],
          error: "down",
          ok: false,
          url: "https://three.example",
        },
        { articles: [], error: "down", ok: false, url: "https://four.example" },
      ],
      new Map([
        ["https://four.example", "Four"],
        ["https://one.example", "One"],
        ["https://three.example", "Three"],
        ["https://two.example", "Two"],
      ]),
    );

    expect(failureLabel).toBe("One, Two, Three and 1 more");
  });
});

// ─── Favicons ─────────────────────────────────────────────────────────────────

describe("favicons", () => {
  test("getFaviconUrl generates favicon URL", async () => {
    const { getFaviconUrl } =
      await import("@/app/dashboard/dashboard-services/favicon");
    const url = getFaviconUrl("https://example.com");
    expect(url).toContain("example.com");
  });

  test("getFaviconUrl handles URLs without protocol", async () => {
    const { getFaviconUrl } =
      await import("@/app/dashboard/dashboard-services/favicon");
    const url = getFaviconUrl("example.com");
    expect(typeof url).toBe("string");
    expect(url).toBe("");
  });

  test("getUrlHostnameDisplayLabel extracts clean hostname", async () => {
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameDisplayLabel("https://www.example.com")).toBe(
      "example.com",
    );
    expect(getUrlHostnameDisplayLabel("http://blog.example.com")).toBe(
      "blog.example.com",
    );
  });
});

// ─── article-collection.ts ───────────────────────────────────────────────────────

describe("article-collection – getArticleKey", () => {
  test("returns trimmed link", async () => {
    expect(
      getArticleKey({
        content: "",
        feedId: 1,
        id: 1,
        lastChecked: new Date(),
        link: " https://example.com/article ",
        publicationDate: new Date(),
        title: "Test",
      }),
    ).toBe("https://example.com/article");
  });
});

describe("article-collection – dedupeAndSortArticles", () => {
  test("removes duplicate articles by link", async () => {
    const now = new Date();
    const articles = [
      {
        content: "Content A",
        feedId: 1,
        id: 1,
        lastChecked: now,
        link: "https://example.com/1",
        publicationDate: now,
        title: "First",
      },
      {
        content: "Content B - longer",
        feedId: 1,
        id: 2,
        lastChecked: now,
        link: "https://example.com/1",
        publicationDate: now,
        title: "Duplicate",
      },
    ];
    const result = dedupeAndSortArticles(articles);
    expect(result).toHaveLength(1);
    // Should keep the one with longer content
    expect(result[0].content).toBe("Content B - longer");
  });

  test("sorts by publication date descending", async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 86400000);
    const articles = [
      {
        content: "",
        feedId: 1,
        id: 1,
        lastChecked: now,
        link: "https://example.com/old",
        publicationDate: earlier,
        title: "Old",
      },
      {
        content: "",
        feedId: 1,
        id: 2,
        lastChecked: now,
        link: "https://example.com/new",
        publicationDate: now,
        title: "New",
      },
    ];
    const result = dedupeAndSortArticles(articles);
    expect(result[0].title).toBe("New");
    expect(result[1].title).toBe("Old");
  });

  test("skips articles without link", async () => {
    const now = new Date();
    const articles = [
      {
        content: "",
        feedId: 1,
        id: 1,
        lastChecked: now,
        link: "",
        publicationDate: now,
        title: "No Link",
      },
      {
        content: "",
        feedId: 1,
        id: 2,
        lastChecked: now,
        link: "https://example.com",
        publicationDate: now,
        title: "Has Link",
      },
    ];
    const result = dedupeAndSortArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Has Link");
  });

  test("keeps article with newer timestamp among same-length content", async () => {
    const older = new Date("2024-01-01");
    const newer = new Date("2024-06-01");
    const articles = [
      {
        content: "Same",
        feedId: 1,
        id: 1,
        lastChecked: older,
        link: "https://example.com/1",
        publicationDate: older,
        title: "Old",
      },
      {
        content: "Same",
        feedId: 1,
        id: 2,
        lastChecked: newer,
        link: "https://example.com/1",
        publicationDate: newer,
        title: "New",
      },
    ];
    const result = dedupeAndSortArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("New");
  });

  test("handles empty array", async () => {
    expect(dedupeAndSortArticles([])).toEqual([]);
  });

  test("handles whitespace-only link", async () => {
    const now = new Date();
    const articles = [
      {
        content: "",
        feedId: 1,
        id: 1,
        lastChecked: now,
        link: "   ",
        publicationDate: now,
        title: "Blank",
      },
    ];
    expect(dedupeAndSortArticles(articles)).toHaveLength(0);
  });
});

// ─── article-content.ts ──────────────────────────────────────────────────────

describe("article-content – buildPreview", () => {
  test("short content returns no overflow", async () => {
    const result = buildPreview("Short text");
    expect(result.preview).toBe("Short text");
    expect(result.hasOverflow).toBe(false);
  });

  test("long content triggers overflow", async () => {
    const longText = "Word ".repeat(100);
    const result = buildPreview(longText);
    expect(result.hasOverflow).toBe(true);
    expect(result.preview.length).toBeLessThanOrEqual(171);
  });

  test("truncates at word boundary", async () => {
    const longText = "hello world ".repeat(50);
    const result = buildPreview(longText);
    expect(result.preview).not.toEndWith(" ");
  });

  test("handles content exactly at limit", async () => {
    const exact = "A".repeat(170);
    const result = buildPreview(exact);
    expect(result.hasOverflow).toBe(false);
    expect(result.preview).toBe(exact);
  });

  test("handles content with no spaces for truncation", async () => {
    const noSpaces = "A".repeat(200);
    const result = buildPreview(noSpaces);
    expect(result.hasOverflow).toBe(true);
    expect(result.preview.length).toBeLessThanOrEqual(170);
  });

  test("collapses repeated whitespace and blank lines before truncation", async () => {
    const result = buildPreview("Alpha\n\n\nBeta\t\tGamma    Delta");
    expect(result.hasOverflow).toBe(false);
    expect(result.preview).toBe("Alpha Beta Gamma Delta");
  });
});

describe("article-content – buildPreview preserves characters", () => {
  test("preserves apostrophes from HTML entities", () => {
    const result = buildPreview("It\u2019s a great day");
    expect(result.preview).toBe("It\u2019s a great day");
  });

  test("preserves smart quotes", () => {
    const result = buildPreview(
      "\u201CHello,\u201D she said, \u201CHow are you?\u201D",
    );
    expect(result.preview).toBe(
      "\u201CHello,\u201D she said, \u201CHow are you?\u201D",
    );
  });

  test("preserves em dashes and en dashes", () => {
    const result = buildPreview(
      "The project \u2014 which started in 2020 \u2013 is ongoing",
    );
    expect(result.preview).toBe(
      "The project \u2014 which started in 2020 \u2013 is ongoing",
    );
  });

  test("preserves angle brackets decoded from entities", () => {
    const result = buildPreview("Use 2 < 3 and 5 > 4 in comparisons");
    expect(result.preview).toBe("Use 2 < 3 and 5 > 4 in comparisons");
  });

  test("preserves ellipsis character", () => {
    const result = buildPreview("Wait\u2026 what happened?");
    expect(result.preview).toBe("Wait\u2026 what happened?");
  });

  test("preserves accented characters", () => {
    const result = buildPreview("Caf\u00E9 cr\u00E8me with na\u00EFvet\u00E9");
    expect(result.preview).toBe("Caf\u00E9 cr\u00E8me with na\u00EFvet\u00E9");
  });

  test("truncation preserves special characters at word boundary", () => {
    const longText =
      "\u201CThis is a fairly long article preview that contains smart quotes and special characters \u2014 including dashes, ellipses\u2026 and more content to exceed the 170 character preview limit for overflow\u201D";
    const result = buildPreview(longText);
    expect(result.hasOverflow).toBe(true);
    expect(result.preview).toContain("\u201C");
    expect(result.preview).toContain("\u2014");
  });

  test("full preview pipeline: HTML entities → plain text → preview", () => {
    const { toPlainText } = require("@/lib/sanitize");
    const { normalizeArticleHtmlSpacing } = require("@/lib/sanitize");

    const rawHtml =
      "<p>The team&rsquo;s &ldquo;Project X&rdquo; &mdash; aims to cut costs.</p>";
    const normalized = normalizeArticleHtmlSpacing(rawHtml);
    const plain = toPlainText(normalized).trim();
    const result = buildPreview(plain);

    expect(result.preview).toContain("team\u2019s");
    expect(result.preview).toContain("\u201CProject X\u201D");
    expect(result.preview).toContain("\u2014");
    expect(result.preview).not.toContain("&rsquo;");
    expect(result.preview).not.toContain("&ldquo;");
    expect(result.preview).not.toContain("&rdquo;");
    expect(result.preview).not.toContain("&mdash;");
  });

  test("full preview pipeline: numeric entities decoded in preview", () => {
    const { toPlainText } = require("@/lib/sanitize");
    const { normalizeArticleHtmlSpacing } = require("@/lib/sanitize");

    const rawHtml =
      "<p>It&#8217;s a &#8220;great&#8221; day &#8212; really.</p>";
    const normalized = normalizeArticleHtmlSpacing(rawHtml);
    const plain = toPlainText(normalized).trim();
    const result = buildPreview(plain);

    expect(result.preview).toBe(
      "It\u2019s a \u201Cgreat\u201D day \u2014 really.",
    );
  });

  test("full preview pipeline: &lt; and &gt; decoded in preview", () => {
    const { toPlainText } = require("@/lib/sanitize");
    const { normalizeArticleHtmlSpacing } = require("@/lib/sanitize");

    const rawHtml = "<p>Use x &lt; 10 and y &gt; 5 in your code.</p>";
    const normalized = normalizeArticleHtmlSpacing(rawHtml);
    const plain = toPlainText(normalized).trim();
    const result = buildPreview(plain);

    expect(result.preview).toBe("Use x < 10 and y > 5 in your code.");
    expect(result.preview).not.toContain("&lt;");
    expect(result.preview).not.toContain("&gt;");
  });
});

describe("article-content – getArticleSourceLabel", () => {
  test("uses feed name when available", async () => {
    const article = {
      content: "",
      feedId: 1,
      feedName: "My Feed",
      id: 1,
      lastChecked: new Date(),
      link: "https://example.com",
      publicationDate: new Date(),
      title: "Test",
    };
    expect(getArticleSourceLabel(article)).toBe("My Feed");
  });

  test("falls back to hostname when no feed name", async () => {
    const article = {
      content: "",
      feedId: 1,
      feedUrl: "https://blog.example.com/feed",
      id: 1,
      lastChecked: new Date(),
      link: "https://example.com/article",
      publicationDate: new Date(),
      title: "Test",
    };
    expect(getArticleSourceLabel(article)).toBe("blog.example.com");
  });

  test("falls back to link hostname when no feed name or feed URL", async () => {
    const article = {
      content: "",
      feedId: 1,
      id: 1,
      lastChecked: new Date(),
      link: "https://news.example.com/article",
      publicationDate: new Date(),
      title: "Test",
    };
    expect(getArticleSourceLabel(article)).toBe("news.example.com");
  });

  test("strips www prefix", async () => {
    const article = {
      content: "",
      feedId: 1,
      id: 1,
      lastChecked: new Date(),
      link: "https://www.example.com/article",
      publicationDate: new Date(),
      title: "Test",
    };
    expect(getArticleSourceLabel(article)).toBe("example.com");
  });

  test("ignores whitespace-only feed name", async () => {
    const article = {
      content: "",
      feedId: 1,
      feedName: "   ",
      id: 1,
      lastChecked: new Date(),
      link: "https://example.com",
      publicationDate: new Date(),
      title: "Test",
    };
    expect(getArticleSourceLabel(article)).not.toBe("   ");
  });
});

describe("article-content – getRichContentClass", () => {
  test("returns different classes for expanded vs collapsed", async () => {
    const expanded = getRichContentClass(true);
    const collapsed = getRichContentClass(false);
    expect(expanded).not.toBe(collapsed);
    expect(expanded).toContain("text-[0.97rem]");
    expect(collapsed).toContain("text-[0.91rem]");
  });

  test("both include shared CSS classes", async () => {
    const expanded = getRichContentClass(true);
    const collapsed = getRichContentClass(false);
    expect(expanded).toContain("break-words");
    expect(collapsed).toContain("break-words");
  });
});

describe("Article Image Rendering", () => {
  test("should include image styling in rich content classes", () => {
    const expandedClass = getRichContentClass(true);
    const collapsedClass = getRichContentClass(false);

    // Verify images are styled (not hidden)
    expect(expandedClass).toContain("[&_img]");
    expect(collapsedClass).toContain("[&_img]");

    // Verify figures are styled (not hidden)
    expect(expandedClass).toContain("[&_figure]");
    expect(collapsedClass).toContain("[&_figure]");

    // Verify images are NOT hidden
    expect(expandedClass).not.toContain("[&_img]:hidden");
    expect(expandedClass).not.toContain("[&_figure]:hidden");
  });

  test("should include responsive image sizing", () => {
    const richContentClass = getRichContentClass(true);

    // Images should be responsive
    expect(richContentClass).toContain("max-w-full");
    expect(richContentClass).toContain("h-auto");
  });
});

beforeEach(() => {
  mock.restore();
  window.localStorage.clear();
});

afterEach(() => {
  mock.restore();
  window.localStorage.clear();
});

interface ArticleLike {
  content: string;
  feedId: number;
  feedName?: string;
  feedUrl?: string;
  id: number;
  isRead?: boolean;
  isStarred?: boolean;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

const makeArticle = (overrides: Partial<ArticleLike> = {}): ArticleLike => ({
  content: "body",
  feedId: 1,
  id: 1,
  lastChecked: new Date("2024-01-01T00:00:00.000Z"),
  link: "https://example.com/article",
  publicationDate: new Date("2024-01-01T00:00:00.000Z"),
  title: "Title",
  ...overrides,
});

describe("dashboard article helpers comprehensive", () => {
  test("dedupeAndSortArticles drops empty links and prefers longer content", async () => {
    const { dedupeAndSortArticles, getArticleKey } =
      await import("@/app/dashboard/dashboard-services/article-collection");

    const a1 = makeArticle({
      content: "short",
      id: 1,
      link: " https://example.com/a ",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    });
    const a1Better = makeArticle({
      content: "this content is definitely longer",
      id: 2,
      link: "https://example.com/a",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    });
    const a2 = makeArticle({
      id: 3,
      link: "https://example.com/b",
      publicationDate: new Date("2024-01-03T00:00:00.000Z"),
    });
    const empty = makeArticle({ id: 4, link: "   " });

    const result = dedupeAndSortArticles([a1, a1Better, a2, empty] as any);

    expect(result).toHaveLength(2);
    expect(result[0]?.link).toBe("https://example.com/b");
    expect(result[1]?.content).toBe("this content is definitely longer");
    expect(getArticleKey(a1 as any)).toBe("https://example.com/a");
  });

  test("dedupeAndSortArticles uses newer publicationDate as tiebreaker", async () => {
    const { dedupeAndSortArticles } =
      await import("@/app/dashboard/dashboard-services/article-collection");

    const older = makeArticle({
      content: "same-size",
      id: 5,
      link: "https://example.com/c",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    });
    const newer = makeArticle({
      content: "same-size",
      id: 6,
      link: "https://example.com/c",
      publicationDate: new Date("2024-01-05T00:00:00.000Z"),
    });

    const result = dedupeAndSortArticles([older, newer] as any);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(6);
  });

  test("buildPreview handles overflow and non-overflow content", async () => {
    const { buildPreview } =
      await import("@/app/dashboard/dashboard-services/article");

    const short = buildPreview("small");
    expect(short.preview).toBe("small");
    expect(short.hasOverflow).toBe(false);

    const longWithSpaces = `${"word ".repeat(45)}tail`;
    const overflow = buildPreview(longWithSpaces);
    expect(overflow.hasOverflow).toBe(true);
    expect(overflow.preview.length).toBeLessThanOrEqual(170);
    expect(overflow.preview.endsWith(" ")).toBe(false);

    const longWithoutSpaces = "x".repeat(300);
    const hardCut = buildPreview(longWithoutSpaces);
    expect(hardCut.hasOverflow).toBe(true);
    expect(hardCut.preview.length).toBe(170);

    const normalizedWhitespace = buildPreview("one\n\n two\t\tthree");
    expect(normalizedWhitespace.preview).toBe("one two three");
  });

  test("getArticleSourceLabel prioritizes feedName then hostname fallback", async () => {
    const { getArticleSourceLabel } =
      await import("@/app/dashboard/dashboard-services/article");
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");

    const named = makeArticle({
      feedName: "My Feed",
      feedUrl: "https://x.com",
    });
    expect(getArticleSourceLabel(named as any)).toBe("My Feed");

    const fromFeedUrl = makeArticle({
      feedName: "   ",
      feedUrl: "https://www.blog.example.com/post",
      link: "https://fallback.example/article",
    });
    expect(getArticleSourceLabel(fromFeedUrl as any)).toBe("blog.example.com");
    expect(getUrlHostnameDisplayLabel("https://www.news.example.com")).toBe(
      "news.example.com",
    );

    const fromLink = makeArticle({
      feedName: "",
      feedUrl: undefined,
      link: "not-a-url",
    });
    expect(getArticleSourceLabel(fromLink as any)).toBe("not-a-url");
  });

  test("getRichContentClass returns expanded and collapsed variants", async () => {
    const { getRichContentClass } =
      await import("@/app/dashboard/dashboard-services/article");

    const expanded = getRichContentClass(true);
    const collapsed = getRichContentClass(false);

    expect(expanded).toContain("text-[0.97rem]");
    expect(expanded).toContain("[&_img]:max-w-full");
    expect(collapsed).toContain("text-[0.91rem]");
    expect(collapsed).toContain("[&_code]:rounded");
  });

  test("mapBatchResultsToArticles keeps article feedName when source name missing", async () => {
    const { mapBatchResultsToArticles } =
      await import("@/app/dashboard/dashboard-services/feed-data");

    const result = mapBatchResultsToArticles(
      [
        {
          articles: [
            makeArticle({
              feedName: "Example Feed",
              feedUrl: "https://feeds.example.com/rss",
            }),
          ],
          ok: true,
          url: "https://feeds.example.com/rss",
        },
      ],
      new Map([["https://feeds.example.com/rss", undefined]]),
      false,
      () => [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.feedName).toBe("Example Feed");
  });

  test("mapBatchResultsToArticles does not set feedName to feed URL", async () => {
    const { mapBatchResultsToArticles } =
      await import("@/app/dashboard/dashboard-services/feed-data");

    const result = mapBatchResultsToArticles(
      [
        {
          articles: [
            makeArticle({
              feedName: undefined,
              feedUrl: "https://feeds.example.com/rss",
              link: "https://news.example.com/post",
            }),
          ],
          ok: true,
          url: "https://feeds.example.com/rss",
        },
      ],
      new Map([["https://feeds.example.com/rss", undefined]]),
      false,
      () => [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.feedName).toBeUndefined();
  });
});

describe("dashboard favicons comprehensive", () => {
  test("getFaviconCacheKey picks first valid hostname from candidates", async () => {
    const { getFaviconCacheKey } =
      await import("@/app/dashboard/dashboard-services/favicon");

    expect(
      getFaviconCacheKey(
        undefined,
        "not-a-url",
        "https://news.example.com/path",
      ),
    ).toBe("news.example.com");
    expect(getFaviconCacheKey(undefined, "bad")).toBeNull();
  });

  test("hydrate loads valid persisted entries and drops stale failure entries", async () => {
    const v2Key = "librerss:favicon-index-cache:v2";

    await import("@/app/dashboard/dashboard-services/favicon");

    window.localStorage.setItem(
      v2Key,
      JSON.stringify({
        "expired.example.com": {
          failedAt: Date.now() - 25 * 60 * 60 * 1000,
          index: -1,
        },
        "missing-timestamp.example.com": { index: -1 },
        "ok.example.com": { index: 4 },
      }),
    );

    const { getCachedFaviconIndex } =
      await import("@/app/dashboard/dashboard-services/favicon");

    expect(getCachedFaviconIndex("ok.example.com")).toBe(4);
    expect(getCachedFaviconIndex("expired.example.com")).toBe(0);
    expect(getCachedFaviconIndex("missing-timestamp.example.com")).toBe(0);
  });

  test("cache index set/get works for success and failure entries", async () => {
    const { getCachedFaviconIndex, setCachedFaviconIndex } =
      await import("@/app/dashboard/dashboard-services/favicon");

    expect(getCachedFaviconIndex("example.com")).toBe(0);

    setCachedFaviconIndex("example.com", 2);
    expect(getCachedFaviconIndex("example.com")).toBe(2);

    setCachedFaviconIndex("failed.example.com", -1);
    expect(getCachedFaviconIndex("failed.example.com")).toBe(-1);

    setCachedFaviconIndex(null, 99);
    expect(getCachedFaviconIndex(null)).toBe(0);
  });

  test("cache trimming keeps storage bounded after many inserts", async () => {
    const { getCachedFaviconIndex, setCachedFaviconIndex } =
      await import("@/app/dashboard/dashboard-services/favicon");

    for (let index = 0; index < 430; index += 1) {
      setCachedFaviconIndex(`bulk-${index}.example.com`, index % 3);
    }

    const raw = window.localStorage.getItem("librerss:favicon-index-cache:v2");
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw ?? "{}");
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(400);
    expect(
      getCachedFaviconIndex("bulk-429.example.com"),
    ).toBeGreaterThanOrEqual(0);
  });

  test("hydrate cache handles persisted payload shape safely", async () => {
    const key = "librerss:favicon-index-cache:v2";
    window.localStorage.setItem(
      key,
      JSON.stringify({
        "": { index: 2 },
        "bad.example.com": { index: "x" },
        "legacy.example.com": 1,
        "ok.example.com": { index: 3 },
      }),
    );

    const { getCachedFaviconIndex } =
      await import("@/app/dashboard/dashboard-services/favicon");

    const ok = getCachedFaviconIndex("ok.example.com");
    const legacy = getCachedFaviconIndex("legacy.example.com");
    const bad = getCachedFaviconIndex("bad.example.com");

    expect(typeof ok).toBe("number");
    expect(typeof legacy).toBe("number");
    expect(bad).toBe(0);
  });

  test("merged favicon candidates include provider and direct icon URLs", async () => {
    const { getFaviconUrl, getMergedFaviconCandidates } =
      await import("@/app/dashboard/dashboard-services/favicon");
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");

    const candidates = getMergedFaviconCandidates(
      "https://sub.blog.example.com/path",
      "https://example.org",
    );

    expect(candidates.length).toBeGreaterThan(8);
    expect(
      candidates.some((url) => url.includes("google.com/s2/favicons")),
    ).toBe(true);
    expect(candidates.some((url) => url.endsWith("/favicon.ico"))).toBe(true);
    expect(getFaviconUrl("https://example.org")).toContain("example.org");
    expect(getFaviconUrl("not-a-url")).toBe("");
    expect(getUrlHostnameDisplayLabel("https://www.Example.com/path")).toBe(
      "example.com",
    );

    const ipCandidates = getMergedFaviconCandidates("http://127.0.0.1/app");
    expect(ipCandidates.some((url) => url.includes("127.0.0.1"))).toBe(true);

    const singleHostCandidates = getMergedFaviconCandidates("http://intranet");
    expect(singleHostCandidates.some((url) => url.includes("intranet"))).toBe(
      true,
    );
  });

  test("favicon tint colors are deterministic and include default fallback", async () => {
    const { getFaviconTintColors } =
      await import("@/app/dashboard/dashboard-services/favicon");

    const a = getFaviconTintColors("https://example.com/a");
    const b = getFaviconTintColors("https://example.com/a");
    const c = getFaviconTintColors("https://other.example/a");
    const d = getFaviconTintColors(undefined, " ");

    expect(a).toEqual(b);
    expect(a.foreground).toMatch(/^hsl\(/);
    expect(a.background).toMatch(/\/ 0\.35\)$/);
    expect(c.foreground).not.toBe(a.foreground);
    expect(d.foreground).toMatch(/^hsl\(/);
  });
});

// ─── feed-batch: full branch coverage ────────────────────────────────────────

describe("feed-batch pure helpers", () => {
  test("mapBatchResultsToArticles: usePlaceholderData returns placeholder articles on failed result", async () => {
    const { mapBatchResultsToArticles } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const placeholderArticle = makeArticle({
      feedName: "Placeholder",
      id: 99,
      link: "https://placeholder.example.com/1",
    });
    const result = mapBatchResultsToArticles(
      [{ articles: [], ok: false, url: "https://example.com/feed" }],
      new Map([["https://example.com/feed", "My Feed"]]),
      true,
      () => [placeholderArticle],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.feedName).toBe("My Feed");
  });

  test("mapBatchResultsToArticles: failed result with usePlaceholderData=false returns empty", async () => {
    const { mapBatchResultsToArticles } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const result = mapBatchResultsToArticles(
      [{ articles: [], ok: false, url: "https://example.com/feed" }],
      new Map([["https://example.com/feed", "My Feed"]]),
      false,
      () => [],
    );
    expect(result).toHaveLength(0);
  });

  test("mapBatchResultsToArticles: ok=true but empty articles falls to placeholder branch", async () => {
    const { mapBatchResultsToArticles } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const placeholder = makeArticle({
      id: 50,
      link: "https://placeholder.example/x",
    });
    const result = mapBatchResultsToArticles(
      [{ articles: [], ok: true, url: "https://example.com/feed" }],
      new Map([["https://example.com/feed", "Feed A"]]),
      true,
      () => [placeholder],
    );
    expect(result).toHaveLength(1);
  });

  test("mapBatchResultsToArticles reuses previous feed articles for unchanged batch items", async () => {
    const { mapBatchResultsToArticles } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const previousArticle = makeArticle({
      feedName: "Feed A",
      feedUrl: "https://example.com/feed",
      id: 77,
      link: "https://example.com/article-77",
      title: "Still current",
    });

    const result = mapBatchResultsToArticles(
      [
        {
          articles: [],
          lastFetchedAt: new Date("2026-03-14T12:00:00.000Z"),
          ok: true,
          unchanged: true,
          url: "https://example.com/feed",
        },
      ],
      new Map([["https://example.com/feed", "Feed A"]]),
      false,
      () => [],
      [previousArticle],
    );

    expect(result).toEqual([previousArticle]);
  });

  test("mapBatchResultsToArticles keeps multiple unchanged articles from the same feed together", async () => {
    const { mapBatchResultsToArticles } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const previousArticles = [
      makeArticle({
        feedName: "Feed A",
        feedUrl: "https://example.com/feed",
        id: 77,
        link: "https://example.com/article-77",
      }),
      makeArticle({
        feedName: "Feed A",
        feedUrl: "https://example.com/feed",
        id: 78,
        link: "https://example.com/article-78",
      }),
    ];

    const result = mapBatchResultsToArticles(
      [
        {
          articles: [],
          ok: true,
          unchanged: true,
          url: "https://example.com/feed",
        },
      ],
      new Map([["https://example.com/feed", "Feed A"]]),
      false,
      () => [],
      previousArticles,
    );

    expect(result).toHaveLength(2);
    expect(result.map((article) => article.link)).toEqual([
      "https://example.com/article-77",
      "https://example.com/article-78",
    ]);
  });

  test("normalizeFeedBatchSources deduplicates by url preserving order", async () => {
    const { normalizeFeedBatchSources } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const sources = [
      { name: "A", url: "https://a.com/feed" },
      { name: "B", url: "https://b.com/feed" },
      { name: "A2", url: "https://a.com/feed" }, // duplicate
      { name: "empty", url: "" }, // empty url filtered
    ];
    const result = normalizeFeedBatchSources(sources);
    expect(result).toHaveLength(2);
    expect(result[0]?.url).toBe("https://a.com/feed");
    expect(result[0]?.name).toBe("A");
    expect(result[1]?.url).toBe("https://b.com/feed");
  });

  test("normalizeFeedBatchSources returns empty array for all-duplicate input", async () => {
    const { normalizeFeedBatchSources } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const result = normalizeFeedBatchSources([
      { name: "X", url: "https://x.com/feed" },
      { name: "X", url: "https://x.com/feed" },
    ]);
    expect(result).toHaveLength(1);
  });

  test("buildBatchRequestSignature produces stable sorted string", async () => {
    const { buildBatchRequestSignature } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const a = buildBatchRequestSignature([
      { name: "B", url: "https://b.com/feed" },
      { name: "A", url: "https://a.com/feed" },
    ]);
    const b = buildBatchRequestSignature([
      { name: "A", url: "https://a.com/feed" },
      { name: "B", url: "https://b.com/feed" },
    ]);
    expect(a).toBe(b);
    expect(a).toContain("https://a.com/feed");
    expect(a).toContain("https://b.com/feed");
  });

  test("buildBatchRequestSignature returns empty string for empty input", async () => {
    const { buildBatchRequestSignature } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    expect(buildBatchRequestSignature([])).toBe("");
  });

  test("mapFeedNodesToBatchSources filters nodes without url", async () => {
    const { mapFeedNodesToBatchSources } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const nodes = [
      { data: { url: "https://a.com/rss" }, label: "Feed A" },
      { data: {}, label: "No URL" },
      { data: { url: "https://b.com/rss" }, label: "Feed B" },
    ] as any[];
    const result = mapFeedNodesToBatchSources(nodes);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Feed A", url: "https://a.com/rss" });
    expect(result[1]).toEqual({ name: "Feed B", url: "https://b.com/rss" });
  });

  test("mapFeedNodesToBatchSources handles null/undefined data", async () => {
    const { mapFeedNodesToBatchSources } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    const nodes = [
      { data: null, label: "No data" },
      { data: undefined, label: "No node" },
    ] as any[];
    const result = mapFeedNodesToBatchSources(nodes);
    expect(result).toHaveLength(0);
  });

  test("FEED_LOADING_FAILSAFE_MS is a positive number", async () => {
    const { FEED_LOADING_FAILSAFE_MS } =
      await import("@/app/dashboard/dashboard-services/feed-data");
    expect(typeof FEED_LOADING_FAILSAFE_MS).toBe("number");
    expect(FEED_LOADING_FAILSAFE_MS).toBeGreaterThan(0);
  });
});
