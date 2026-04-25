import { describe, expect, test } from "bun:test";

import type { FeedRecord } from "../src/lib/core/refresher";

const loadPipelineModule = () => import("../src/lib/core/pipeline");

test("buildRefreshPlan returns per-feed refresh decisions", async () => {
  const { buildRefreshPlan } = await loadPipelineModule();
  const skippedFeed: FeedRecord = {
    id: 1,
    lastFetched: new Date(0),
    lastFetchError: null,
    url: "https://skip.example/feed.xml",
  };
  const forceRetryFeed: FeedRecord = {
    id: 2,
    lastFetched: new Date(),
    lastFetchError: "upstream failed",
    url: "https://retry.example/feed.xml",
  };

  expect(
    buildRefreshPlan(
      new Map([[skippedFeed.url, skippedFeed]]),
      [skippedFeed.url, "https://missing.example/feed.xml"],
      true,
      false,
    ),
  ).toEqual([
    {
      decision: "skip-refresh-flag",
      url: skippedFeed.url,
    },
    {
      decision: "missing-feed-record",
      url: "https://missing.example/feed.xml",
    },
  ]);

  expect(
    buildRefreshPlan(
      new Map([
        [forceRetryFeed.url, forceRetryFeed],
        [skippedFeed.url, skippedFeed],
      ]),
      [skippedFeed.url, forceRetryFeed.url],
      false,
      true,
    ),
  ).toEqual([
    {
      decision: "refresh-force",
      lastFetched: skippedFeed.lastFetched,
      url: skippedFeed.url,
    },
    {
      decision: "refresh-force",
      lastFetched: forceRetryFeed.lastFetched,
      url: forceRetryFeed.url,
    },
  ]);
});

// Regression test: \s in a JS template literal is cooked to "s" by Drizzle's sql
// tag, so the regex sent to PostgreSQL becomes 's+' — matching ALL lowercase 's'
// and replacing them with spaces instead of collapsing whitespace.
// The fix is '\\s+' (escaped backslash) which sends '\s+' to PostgreSQL.
test("SQL whitespace-collapse regex escaping does not strip lowercase s", () => {
  const { sql } = require("drizzle-orm") as typeof import("drizzle-orm");

  // Simulate the actual pattern from queryTopArticlesPerFeed
  const q = sql`regexp_replace(content, '\\s+', ' ', 'g')`;
  // Access query chunks via Drizzle's internal structure

  const raw = JSON.stringify((q as any).queryChunks);

  // The SQL must contain literal '\s+' (with backslash) not 's+'
  expect(raw).toContain("\\\\s+");
  expect(raw).not.toMatch(/'s\+'/);
});

// ─── buildRefreshPlan additional branches ────────────────────────────────────

test("buildRefreshPlan returns use-cache for fresh feeds", async () => {
  const { buildRefreshPlan } = await loadPipelineModule();
  const freshFeed: FeedRecord = {
    id: 1,
    lastFetched: new Date(),
    lastFetchError: null,
    url: "https://fresh.example/feed.xml",
  };

  const result = buildRefreshPlan(
    new Map([[freshFeed.url, freshFeed]]),
    [freshFeed.url],
    false,
    false,
  );

  expect(result).toEqual([
    {
      decision: "use-cache",
      lastFetched: freshFeed.lastFetched,
      url: freshFeed.url,
    },
  ]);
});

test("buildRefreshPlan returns refresh-stale for old feeds", async () => {
  const { buildRefreshPlan } = await loadPipelineModule();
  const staleFeed: FeedRecord = {
    id: 1,
    lastFetched: new Date(0),
    lastFetchError: null,
    url: "https://stale.example/feed.xml",
  };

  const result = buildRefreshPlan(
    new Map([[staleFeed.url, staleFeed]]),
    [staleFeed.url],
    false,
    false,
  );

  expect(result).toEqual([
    {
      decision: "refresh-stale",
      lastFetched: staleFeed.lastFetched,
      url: staleFeed.url,
    },
  ]);
});

test("buildRefreshPlan returns force-cooldown-use-cache for recently-fetched feed with forceRefresh", async () => {
  const { buildRefreshPlan } = await loadPipelineModule();
  const recentFeed: FeedRecord = {
    id: 1,
    lastFetched: new Date(),
    lastFetchError: null,
    url: "https://recent.example/feed.xml",
  };

  const result = buildRefreshPlan(
    new Map([[recentFeed.url, recentFeed]]),
    [recentFeed.url],
    false,
    true,
  );

  expect(result).toEqual([
    {
      decision: "force-cooldown-use-cache",
      lastFetched: recentFeed.lastFetched,
      url: recentFeed.url,
    },
  ]);
});

test("buildRefreshPlan returns refresh-upstream-override for the dev upstream override", async () => {
  const { buildRefreshPlan } = await loadPipelineModule();
  const recentFeed: FeedRecord = {
    id: 1,
    lastFetched: new Date(),
    lastFetchError: null,
    url: "https://recent.example/feed.xml",
  };

  const result = buildRefreshPlan(
    new Map([[recentFeed.url, recentFeed]]),
    [recentFeed.url],
    false,
    false,
    true,
  );

  expect(result).toEqual([
    {
      decision: "refresh-upstream-override",
      lastFetched: recentFeed.lastFetched,
      url: recentFeed.url,
    },
  ]);
});

// ─── mapRowsToArticleMap ─────────────────────────────────────────────────────

describe("mapRowsToArticleMap", () => {
  const makeFeedByUrl = (entries: FeedRecord[]) =>
    new Map(entries.map((f) => [f.url, f]));

  const feed1: FeedRecord = {
    id: 10,
    lastFetched: new Date(),
    lastFetchError: null,
    url: "https://feed-one.example/rss",
  };

  const feed2: FeedRecord = {
    id: 20,
    lastFetched: new Date(),
    lastFetchError: null,
    url: "https://feed-two.example/rss",
  };

  test("maps valid rows to article arrays keyed by feed URL", async () => {
    const { mapRowsToArticleMap } = await loadPipelineModule();
    const now = new Date();
    const rows = [
      {
        content: "Hello world",
        feedId: 10,
        id: 1,
        isRead: false,
        isStarred: true,
        lastChecked: now,
        link: "https://example.com/article-1",
        publicationDate: now,
        title: "Article One",
      },
      {
        content: "Second article",
        feedId: 20,
        id: 2,
        isRead: true,
        isStarred: false,
        lastChecked: now,
        link: "https://example.com/article-2",
        publicationDate: now,
        title: "Article Two",
      },
    ];

    const result = mapRowsToArticleMap(rows, makeFeedByUrl([feed1, feed2]), [
      feed1.url,
      feed2.url,
    ]);

    expect(result.get(feed1.url)).toHaveLength(1);
    expect(result.get(feed2.url)).toHaveLength(1);

    const art1 = result.get(feed1.url)![0]!;
    expect(art1.id).toBe(1);
    expect(art1.feedId).toBe(10);
    expect(art1.isStarred).toBe(true);
    expect(art1.title).toBe("Article One");
    expect(art1.link).toBe("https://example.com/article-1");
    expect(art1.hasFullContent).toBe(false);

    const art2 = result.get(feed2.url)![0]!;
    expect(art2.id).toBe(2);
    expect(art2.isRead).toBe(true);
  });

  test("returns empty arrays for URLs with no matching rows", async () => {
    const { mapRowsToArticleMap } = await loadPipelineModule();
    const result = mapRowsToArticleMap([], makeFeedByUrl([feed1]), [feed1.url]);

    expect(result.get(feed1.url)).toEqual([]);
  });

  test("skips rows with unknown feedId", async () => {
    const { mapRowsToArticleMap } = await loadPipelineModule();
    const rows = [
      {
        content: "Orphan",
        feedId: 999,
        id: 1,
        isRead: false,
        isStarred: false,
        lastChecked: new Date(),
        link: "https://example.com/orphan",
        publicationDate: new Date(),
        title: "Orphan",
      },
    ];

    const result = mapRowsToArticleMap(rows, makeFeedByUrl([feed1]), [
      feed1.url,
    ]);

    expect(result.get(feed1.url)).toEqual([]);
  });

  test("strips span wrapper tags from content preview", async () => {
    const { mapRowsToArticleMap } = await loadPipelineModule();
    const rows = [
      {
        content: "<span class='highlight'>Important</span> text",
        feedId: 10,
        id: 1,
        isRead: false,
        isStarred: false,
        lastChecked: new Date(),
        link: "https://example.com/a",
        publicationDate: new Date(),
        title: "Test",
      },
    ];

    const result = mapRowsToArticleMap(rows, makeFeedByUrl([feed1]), [
      feed1.url,
    ]);

    const article = result.get(feed1.url)![0]!;
    expect(article.content).not.toContain("<span");
    expect(article.content).toContain("Important");
  });

  test("skips malformed rows with missing required fields", async () => {
    const { mapRowsToArticleMap } = await loadPipelineModule();
    const malformed = [
      {
        content: "text",
        feedId: 10,
        id: 1,
        isRead: false,
        isStarred: false,
        lastChecked: "invalid-not-a-date-object", // still string, OK
        link: "https://example.com/a",
        publicationDate: undefined as any, // invalid - required
        title: "Test",
      },
    ];

    const result = mapRowsToArticleMap(malformed, makeFeedByUrl([feed1]), [
      feed1.url,
    ]);

    expect(result.get(feed1.url)).toEqual([]);
  });

  test("handles null content, title, and link gracefully", async () => {
    const { mapRowsToArticleMap } = await loadPipelineModule();
    const rows = [
      {
        content: null,
        feedId: 10,
        id: 1,
        isRead: null,
        isStarred: null,
        lastChecked: new Date(),
        link: null,
        publicationDate: new Date(),
        title: null,
      },
    ];

    const result = mapRowsToArticleMap(rows, makeFeedByUrl([feed1]), [
      feed1.url,
    ]);

    const article = result.get(feed1.url)![0]!;
    expect(article.content).toBe("");
    expect(article.title).toBe("");
    expect(article.link).toBe("");
    expect(article.isRead).toBe(false);
    expect(article.isStarred).toBe(false);
  });

  test("handles string-typed id and feedId", async () => {
    const { mapRowsToArticleMap } = await loadPipelineModule();
    const rows = [
      {
        content: "text",
        feedId: "10",
        id: "42",
        isRead: 1,
        isStarred: 0,
        lastChecked: new Date().toISOString(),
        link: "https://example.com/a",
        publicationDate: new Date().toISOString(),
        title: "String IDs",
      },
    ];

    const result = mapRowsToArticleMap(rows, makeFeedByUrl([feed1]), [
      feed1.url,
    ]);

    const article = result.get(feed1.url)![0]!;
    expect(article.id).toBe(42);
    expect(article.feedId).toBe(10);
    expect(article.isRead).toBe(true);
    expect(article.isStarred).toBe(false);
  });

  test("skips rows with NaN id after coercion", async () => {
    const { mapRowsToArticleMap } = await loadPipelineModule();
    const rows = [
      {
        content: "text",
        feedId: 10,
        id: "not-a-number",
        isRead: false,
        isStarred: false,
        lastChecked: new Date(),
        link: "https://example.com/a",
        publicationDate: new Date(),
        title: "Bad ID",
      },
    ];

    const result = mapRowsToArticleMap(rows, makeFeedByUrl([feed1]), [
      feed1.url,
    ]);

    expect(result.get(feed1.url)).toEqual([]);
  });
});
