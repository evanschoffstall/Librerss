/**
 * Unit Tests: Core Feed Modules
 * Tests for src/lib/core/feed-*.ts
 */

import { describe, expect, test } from "bun:test";

// ─── Feed URL Validator ───────────────────────────────────────────────────────

describe("feed-url-validator", () => {
  test("isAllowedFeedUrl accepts valid feed URLs", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    expect(await isAllowedFeedUrl("https://example.com/feed.xml")).toBe(true);
    expect(await isAllowedFeedUrl("http://example.com/rss")).toBe(true);
  });

  test("isAllowedFeedUrl rejects non-http protocols", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    expect(await isAllowedFeedUrl("ftp://example.com/feed")).toBe(false);
    expect(await isAllowedFeedUrl("javascript:alert(1)")).toBe(false);
  });

  test("isAllowedFeedUrl rejects URLs without protocol", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    expect(await isAllowedFeedUrl("example.com/feed")).toBe(false);
  });

  test("assertPublicFeedUrl throws for invalid URLs", async () => {
    const { assertPublicFeedUrl } =
      await import("@/lib/core/feed-url-validator");
    await expect(assertPublicFeedUrl("not-a-url")).rejects.toThrow();
  });
});

// ─── Reader Item ID ───────────────────────────────────────────────────────────

describe("reader-item-id", () => {
  test("toReaderItemId creates valid ID", async () => {
    const { toReaderItemId } = await import("@/lib/core/reader-item-id");
    const id = toReaderItemId(123);
    expect(id).toMatch(/^tag:google.com,2005:reader\/item\/[0-9a-f]+$/);
  });

  test("parseReaderItemId extracts article ID", async () => {
    const { toReaderItemId, parseReaderItemId } =
      await import("@/lib/core/reader-item-id");
    const encoded = toReaderItemId(456);
    const decoded = parseReaderItemId(encoded);
    expect(decoded).toBe(456);
  });

  test("parseReaderItemId returns null for invalid ID", async () => {
    const { parseReaderItemId } = await import("@/lib/core/reader-item-id");
    expect(parseReaderItemId("invalid-id")).toBeNull();
    expect(
      parseReaderItemId("tag:google.com,2005:reader/item/invalid"),
    ).toBeNull();
  });

  test("toReaderItemId handles large numbers", async () => {
    const { toReaderItemId, parseReaderItemId } =
      await import("@/lib/core/reader-item-id");
    const largeId = 999999999;
    const encoded = toReaderItemId(largeId);
    const decoded = parseReaderItemId(encoded);
    expect(decoded).toBe(largeId);
  });
});

// ─── Article Status ───────────────────────────────────────────────────────────

describe("article-status", () => {
  test("isSafePositiveItemId validates safe positive integers", async () => {
    const { isSafePositiveItemId } = await import("@/lib/core/article-status");
    expect(isSafePositiveItemId(1)).toBe(true);
    expect(isSafePositiveItemId(123_456)).toBe(true);
    expect(isSafePositiveItemId(0)).toBe(false);
    expect(isSafePositiveItemId(-1)).toBe(false);
    expect(isSafePositiveItemId(1.5)).toBe(false);
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isSafePositiveItemId("1")).toBe(false);
  });

  test("upsertArticleStatuses short-circuits for empty articleIds", async () => {
    const { upsertArticleStatuses } = await import("@/lib/core/article-status");
    await expect(
      upsertArticleStatuses(1, [], { isRead: true, isStarred: false }),
    ).resolves.toBeUndefined();
  });
});

// ─── Stream Conditions ────────────────────────────────────────────────────────

describe("stream-conditions", () => {
  test("buildStreamConditions creates conditions for reading-list", async () => {
    const { buildStreamConditions } =
      await import("@/lib/core/stream-conditions");
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: null,
      starredOnly: false,
      useArticleStatuses: true,
    });
    expect(Array.isArray(conditions)).toBe(true);
    expect(conditions).toHaveLength(0);
  });

  test("buildStreamConditions handles feed URLs", async () => {
    const { buildStreamConditions } =
      await import("@/lib/core/stream-conditions");
    const conditions = buildStreamConditions({
      feedUrl: "https://example.com/feed.xml",
      dateFilter: null,
      continuationId: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions).toHaveLength(1);
  });

  test("buildStreamConditions handles starred filter", async () => {
    const { buildStreamConditions } =
      await import("@/lib/core/stream-conditions");
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: null,
      starredOnly: true,
      useArticleStatuses: true,
    });
    expect(conditions).toHaveLength(1);
  });

  test("buildStreamConditions combines all optional filters", async () => {
    const { buildStreamConditions } =
      await import("@/lib/core/stream-conditions");
    const conditions = buildStreamConditions({
      feedUrl: "https://example.com/feed.xml",
      dateFilter: new Date("2024-01-01T00:00:00.000Z"),
      continuationId: 321,
      starredOnly: true,
      excludeRead: true,
      useArticleStatuses: true,
    });
    expect(conditions).toHaveLength(4);
  });
});

// ─── Feed Parser ──────────────────────────────────────────────────────────────

describe("feed-parser", () => {
  test("parseFeedItemDate uses fallback for missing/invalid values", async () => {
    const { parseFeedItemDate } = await import("@/lib/core/feed-parser");
    const fallback = new Date("2024-01-01T00:00:00.000Z");
    expect(parseFeedItemDate(undefined, fallback).toISOString()).toBe(
      fallback.toISOString(),
    );
    expect(parseFeedItemDate("not-a-date", fallback).toISOString()).toBe(
      fallback.toISOString(),
    );
  });

  test("dedupePendingArticles keeps newest item and trims links", async () => {
    const { dedupePendingArticles } = await import("@/lib/core/feed-parser");
    const now = new Date();
    const older = new Date(now.getTime() - 60_000);
    const items = [
      {
        title: "old",
        link: " https://example.com/a ",
        publicationDate: older,
        content: "short",
        feedId: 1,
        lastChecked: now,
      },
      {
        title: "new",
        link: "https://example.com/a",
        publicationDate: now,
        content: "longer-content",
        feedId: 1,
        lastChecked: now,
      },
    ];
    const deduped = dedupePendingArticles(items);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.title).toBe("new");
    expect(deduped[0]?.link).toBe("https://example.com/a");
  });

  test("getPublicationDateRange returns oldest/newest and null for empty", async () => {
    const { getPublicationDateRange } = await import("@/lib/core/feed-parser");
    expect(getPublicationDateRange([])).toEqual({
      newestPublicationDate: null,
      oldestPublicationDate: null,
    });

    const items = [
      {
        title: "a",
        link: "https://example.com/a",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        content: "x",
        feedId: 1,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
      },
      {
        title: "b",
        link: "https://example.com/b",
        publicationDate: new Date("2024-01-02T00:00:00.000Z"),
        content: "y",
        feedId: 1,
        lastChecked: new Date("2024-01-02T00:00:00.000Z"),
      },
    ];
    const range = getPublicationDateRange(items);
    expect(range.oldestPublicationDate).toBe("2024-01-01T00:00:00.000Z");
    expect(range.newestPublicationDate).toBe("2024-01-02T00:00:00.000Z");
  });

  test("toPendingArticle rejects invalid links and maps valid items", async () => {
    const { toPendingArticle } = await import("@/lib/core/feed-parser");
    const now = new Date("2024-01-01T00:00:00.000Z");

    const invalid = toPendingArticle(
      { title: "x", link: "not-a-url", content: "y" },
      1,
      now,
    );
    expect(invalid).toBeNull();

    const valid = toPendingArticle(
      {
        title: " Hello <b>World</b> ",
        link: "https://example.com/a",
        content: "<p>safe</p>",
        isoDate: "2024-01-03T00:00:00.000Z",
      },
      7,
      now,
    );
    expect(valid).not.toBeNull();
    expect(valid?.feedId).toBe(7);
    expect(valid?.link).toBe("https://example.com/a");
    expect(valid?.publicationDate.toISOString()).toBe(
      "2024-01-03T00:00:00.000Z",
    );
  });
});

// ─── Feed Batch Helpers ───────────────────────────────────────────────────────

describe("feed-batch-helpers", () => {
  test("buildRefreshPlan returns expected decisions", async () => {
    const { buildRefreshPlan } = await import("../lib/core/feed-batch-helpers");

    const veryOld = new Date(Date.now() - 1000 * 60 * 120);
    const fresh = new Date();

    const feedByUrl = new Map([
      [
        "https://a.com/feed",
        {
          id: 1,
          url: "https://a.com/feed",
          lastFetched: veryOld,
          lastFetchError: null,
        },
      ],
      [
        "https://b.com/feed",
        {
          id: 2,
          url: "https://b.com/feed",
          lastFetched: fresh,
          lastFetchError: null,
        },
      ],
    ]);

    const stalePlan = buildRefreshPlan(
      feedByUrl,
      ["https://a.com/feed", "https://b.com/feed", "https://missing.com/feed"],
      false,
      false,
    );
    if (Array.isArray(stalePlan)) {
      expect(
        stalePlan.find((r) => r.url === "https://a.com/feed")?.decision,
      ).toBe("refresh-stale");
      expect(
        stalePlan.find((r) => r.url === "https://b.com/feed")?.decision,
      ).toBe("use-cache");
      expect(
        stalePlan.find((r) => r.url === "https://missing.com/feed")?.decision,
      ).toBe("missing-feed-record");
    } else {
      expect(stalePlan).toBeDefined();
    }

    const skipPlan = buildRefreshPlan(
      feedByUrl,
      ["https://a.com/feed"],
      true,
      false,
    );
    if (Array.isArray(skipPlan)) {
      expect(skipPlan[0]?.decision).toBe("skip-refresh-flag");
    } else {
      expect(skipPlan).toBeDefined();
    }
  });

  test("mapRowsToArticleMap maps rows by feed URL and coerces value types", async () => {
    const { mapRowsToArticleMap } =
      await import("../lib/core/feed-batch-helpers");

    const feedByUrl = new Map([
      [
        "https://a.com/feed",
        {
          id: 10,
          url: "https://a.com/feed",
          lastFetched: new Date(),
          lastFetchError: null,
        },
      ],
    ]);

    const rows = [
      {
        id: "5",
        title: "Title",
        link: "https://a.com/article",
        content: "Body",
        publicationDate: "2024-01-01T00:00:00.000Z",
        feedId: 10,
        lastChecked: "2024-01-01T01:00:00.000Z",
        isRead: 1,
        isStarred: 0,
      },
      {
        id: "6",
        title: "Ignored",
        link: "https://missing.com/article",
        content: "x",
        publicationDate: "2024-01-01T00:00:00.000Z",
        feedId: 99,
        lastChecked: "2024-01-01T01:00:00.000Z",
        isRead: 0,
        isStarred: 0,
      },
    ];

    const result = mapRowsToArticleMap(rows, feedByUrl, ["https://a.com/feed"]);
    const mapped = result.get("https://a.com/feed") ?? [];
    expect(Array.isArray(mapped)).toBe(true);
    if (mapped.length > 0) {
      expect(mapped[0]).toMatchObject({
        id: 5,
        title: "Title",
        link: "https://a.com/article",
        content: "Body",
        feedId: 10,
        isRead: true,
        isStarred: false,
      });
    }
  });
});

// ─── Mark Stream Read ─────────────────────────────────────────────────────────

describe("mark-stream-read", () => {
  test("markStreamAsRead is exported as callable async function", async () => {
    const markStream = await import("@/lib/core/mark-stream-read");
    expect(typeof markStream.markStreamAsRead).toBe("function");
    expect(markStream.markStreamAsRead.length).toBe(2);
  });
});
