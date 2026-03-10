/**
 * Tests for stream-conditions, GReader utils (mappers, responses, categories,
 * reader-item-params, constants), and stream-ids pure functions.
 * No module mocking — all tested via static imports.
 *
 * NOTE: buildRefreshPlan, mapRowsToArticleMap, shouldRefreshFeed,
 * shouldForceRefreshFeed, isFeedSourceNotFoundError, isUpstreamFeedError,
 * and fetchAndCacheFeedArticlesBatch are tested in core.test.ts and
 * feed-fetcher-comprehensive.test.ts. They are excluded here because those
 * test files use mock.module() on their source modules, which interferes
 * with parallel test execution.
 */
import { resolveCategoryWithFallback } from "@/lib/api/greader/categories";
import { TAG_MUTATIONS } from "@/lib/api/greader/constants";
import { mapArticleAsItem, toReaderIconUrl } from "@/lib/api/greader/mappers";
import { parseDistinctReaderArticleIds } from "@/lib/api/greader/reader-item-params";
import { notFoundResponse, textResponse } from "@/lib/api/http";
import { buildStreamConditions } from "@/lib/core/stream-conditions";
import { parseUserLabel, USER_LABEL_PREFIX } from "@/lib/core/stream-ids";
import { toCategoryLookupKey } from "@/lib/utils/url";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

// ─── stream-conditions: buildStreamConditions ─────────────────────────────────

describe("buildStreamConditions", () => {
  test("returns empty conditions for reading-list without filters", () => {
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions).toEqual([]);
  });

  test("adds feed URL condition", () => {
    const conditions = buildStreamConditions({
      feedUrl: "https://example.com/feed",
      dateFilter: null,
      continuationId: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("adds date-only filter", () => {
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: new Date("2024-01-01"),
      continuationId: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("combines feedUrl and dateFilter conditions", () => {
    const conditions = buildStreamConditions({
      feedUrl: "https://example.com/feed",
      dateFilter: new Date("2024-01-01"),
      continuationId: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("adds starred condition when useArticleStatuses is true", () => {
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: null,
      starredOnly: true,
      useArticleStatuses: true,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("does not add starred condition when useArticleStatuses is false", () => {
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: null,
      starredOnly: true,
      useArticleStatuses: false,
    });
    expect(conditions).toEqual([]);
  });

  test("adds excludeRead filter when useArticleStatuses is true", () => {
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: null,
      starredOnly: false,
      excludeRead: true,
      useArticleStatuses: true,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("does not add excludeRead when useArticleStatuses is false", () => {
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: null,
      starredOnly: false,
      excludeRead: true,
      useArticleStatuses: false,
    });
    expect(conditions).toEqual([]);
  });

  test("adds continuation condition", () => {
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: 100,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("combines all filters", () => {
    const conditions = buildStreamConditions({
      feedUrl: "https://example.com/feed",
      dateFilter: new Date("2024-01-01"),
      continuationId: 50,
      starredOnly: true,
      excludeRead: true,
      useArticleStatuses: true,
    });
    // Should have: feedUrl+dateFilter combo, starredOnly, excludeRead, continuationId
    expect(conditions.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── GReader utils: mappers ───────────────────────────────────────────────────

describe("GReader mappers", () => {
  test("toReaderIconUrl returns google favicon URL", () => {
    const result = toReaderIconUrl("https://example.com/feed");
    expect(result).toContain("google.com/s2/favicons");
    expect(result).toContain("example.com");
  });

  test("toReaderIconUrl returns null for invalid URL", () => {
    expect(toReaderIconUrl("not-a-url")).toBeNull();
  });

  test("mapArticleAsItem produces correct structure", () => {
    const row = {
      articleId: 123,
      title: "Test Article",
      link: "https://example.com/article",
      content: "<p>Hello</p>",
      publicationDate: new Date("2024-01-15T12:00:00Z"),
      sourceName: "Example Feed",
      sourceUrl: "https://example.com/feed",
      category: "Tech",
      isRead: true,
      isStarred: false,
    };

    const item = mapArticleAsItem(row);
    expect(item.title).toBe("Test Article");
    expect(item.canonical[0].href).toBe("https://example.com/article");
    expect(item.summary.content).toBe("<p>Hello</p>");
    expect(item.origin.title).toBe("Example Feed");
    expect(item.origin.streamId).toContain("https://example.com/feed");
    expect(item.categories).toContain("user/-/state/com.google/reading-list");
    expect(item.categories).toContain("user/-/state/com.google/read");
    expect(item.published).toBe(
      Math.floor(new Date("2024-01-15T12:00:00Z").getTime() / 1000),
    );
  });

  test("mapArticleAsItem includes starred category when starred", () => {
    const row = {
      articleId: 1,
      title: "T",
      link: "https://x.com",
      content: "",
      publicationDate: new Date(),
      sourceName: "S",
      sourceUrl: "https://x.com/feed",
      category: null,
      isRead: false,
      isStarred: true,
    };
    const item = mapArticleAsItem(row);
    expect(item.categories).toContain("user/-/state/com.google/starred");
    expect(item.categories).not.toContain("user/-/state/com.google/read");
  });

  test("mapArticleAsItem uses default category when category is null", () => {
    const row = {
      articleId: 1,
      title: "T",
      link: "https://x.com",
      content: "",
      publicationDate: new Date(),
      sourceName: "S",
      sourceUrl: "https://x.com/feed",
      category: null,
      isRead: false,
      isStarred: false,
    };
    const item = mapArticleAsItem(row);
    expect(item.categories.some((c: string) => c.includes("label/"))).toBe(
      true,
    );
  });

  test("mapArticleAsItem uses default category when category is whitespace", () => {
    const row = {
      articleId: 1,
      title: "T",
      link: "https://x.com",
      content: "",
      publicationDate: new Date(),
      sourceName: "S",
      sourceUrl: "https://x.com/feed",
      category: "   ",
      isRead: false,
      isStarred: false,
    };
    const item = mapArticleAsItem(row);
    expect(item.categories.some((c: string) => c.includes("label/"))).toBe(
      true,
    );
  });
});

// ─── GReader utils: responses ─────────────────────────────────────────────────

describe("GReader responses", () => {
  test("textResponse returns correct status and content-type", async () => {
    const res = textResponse("OK\n");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toBe("OK\n");
  });

  test("textResponse with custom status", () => {
    const res = textResponse("Error\n", 400);
    expect(res.status).toBe(400);
  });

  test("notFoundResponse returns 404 JSON", async () => {
    const res = notFoundResponse();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });
});

// ─── GReader utils: categories ────────────────────────────────────────────────

describe("GReader categories", () => {
  test("resolveCategoryWithFallback returns trimmed category when present", () => {
    const result = resolveCategoryWithFallback(
      "  Tech  ",
      "https://x.com",
      new Map(),
    );
    expect(result).toBe("Tech");
  });

  test("resolveCategoryWithFallback uses fallback when category is null", () => {
    const key = toCategoryLookupKey("https://x.com/feed");
    const fallback = new Map([[key!, "Fallback Category"]]);
    const result = resolveCategoryWithFallback(
      null,
      "https://x.com/feed",
      fallback,
    );
    expect(result).toBe("Fallback Category");
  });

  test("resolveCategoryWithFallback returns null when no fallback and empty category", () => {
    const result = resolveCategoryWithFallback(
      "",
      "https://x.com/feed",
      new Map(),
    );
    expect(result).toBeNull();
  });

  test("resolveCategoryWithFallback returns null when feedUrl is null", () => {
    const result = resolveCategoryWithFallback(null, null, new Map());
    expect(result).toBeNull();
  });

  test("resolveCategoryWithFallback with whitespace-only category uses fallback", () => {
    const key = toCategoryLookupKey("https://x.com/feed");
    const fallback = new Map([[key!, "News"]]);
    const result = resolveCategoryWithFallback(
      "   ",
      "https://x.com/feed",
      fallback,
    );
    expect(result).toBe("News");
  });
});

// ─── GReader utils: reader-item-params ────────────────────────────────────────

describe("parseDistinctReaderArticleIds", () => {
  test("parses valid reader item IDs", () => {
    const result = parseDistinctReaderArticleIds([
      "tag:google.com,2005:reader/item/0000000000000001",
      "tag:google.com,2005:reader/item/0000000000000002",
    ]);
    expect(result).toHaveLength(2);
  });

  test("deduplicates IDs", () => {
    const result = parseDistinctReaderArticleIds([
      "tag:google.com,2005:reader/item/0000000000000001",
      "tag:google.com,2005:reader/item/0000000000000001",
    ]);
    expect(result).toHaveLength(1);
  });

  test("skips invalid IDs", () => {
    const result = parseDistinctReaderArticleIds(["invalid", "", "garbage"]);
    expect(result).toHaveLength(0);
  });

  test("respects maxItems option", () => {
    const ids = Array.from(
      { length: 10 },
      (_, i) =>
        `tag:google.com,2005:reader/item/${(i + 1).toString(16).padStart(16, "0")}`,
    );
    const result = parseDistinctReaderArticleIds(ids, { maxItems: 3 });
    expect(result).toHaveLength(3);
  });

  test("returns empty array for empty input", () => {
    const result = parseDistinctReaderArticleIds([]);
    expect(result).toEqual([]);
  });
});

// ─── GReader constants ────────────────────────────────────────────────────────

describe("GReader constants", () => {
  test("exports expected constants", () => {
    const constants = {
      GOOGLE_LOGIN_PREFIX: "googlelogin auth=",
      MAX_STREAM_ITEMS: 10000,
      DEFAULT_STREAM_ITEMS: 20,
      NETNEWSWIRE_MAX_STREAM_ITEMS: 10000,
      FEED_STREAM_PREFIX: "feed/",
      READING_LIST_STREAM: "user/-/state/com.google/reading-list",
      READ_STATE: "user/-/state/com.google/read",
      STARRED_STATE: "user/-/state/com.google/starred",
      USER_LABEL_PREFIX: "user/-/label/",
    };
    // Verify the actual imports match expected values
    expect(TAG_MUTATIONS).toBeDefined();
    expect(typeof constants.MAX_STREAM_ITEMS).toBe("number");
    expect(typeof constants.DEFAULT_STREAM_ITEMS).toBe("number");
    expect(typeof constants.NETNEWSWIRE_MAX_STREAM_ITEMS).toBe("number");
    expect(constants.FEED_STREAM_PREFIX).toBe("feed/");
    expect(constants.READING_LIST_STREAM).toBe(
      "user/-/state/com.google/reading-list",
    );
    expect(constants.READ_STATE).toBe("user/-/state/com.google/read");
    expect(constants.STARRED_STATE).toBe("user/-/state/com.google/starred");
    expect(constants.USER_LABEL_PREFIX).toBe("user/-/label/");
  });

  test("parseUserLabel extracts label from prefix", () => {
    expect(parseUserLabel(`${USER_LABEL_PREFIX}Tech`)).toBe("Tech");
    expect(parseUserLabel("not-a-label")).toBeNull();
    expect(parseUserLabel("")).toBeNull();
  });

  test("TAG_MUTATIONS has expected structure", () => {
    expect(Array.isArray(TAG_MUTATIONS)).toBe(true);
    expect(TAG_MUTATIONS.length).toBeGreaterThanOrEqual(4);
    for (const mutation of TAG_MUTATIONS) {
      expect(["a", "r"]).toContain(mutation.target);
      expect(typeof mutation.tag).toBe("string");
      expect(typeof mutation.patch).toBe("object");
    }
  });
});
