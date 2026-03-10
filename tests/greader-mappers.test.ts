import { resolveCategoryWithFallback } from "@/lib/api/greader/categories";
import { mapArticleAsItem, toReaderIconUrl } from "@/lib/api/greader/mappers";
import {
  parseOlderThanDate,
  parseStreamId,
  parseStreamPaging,
  shouldExcludeReadFromStream,
} from "@/lib/api/greader/stream-service";
import { parseReaderStreamItems, readerItemToArticle } from "@/lib/api/http";
import {
  FEED_STREAM_PREFIX,
  parseReaderItemId,
  parseUserLabel,
  READING_LIST_STREAM,
  READ_STATE,
  STARRED_STATE,
  toReaderItemId,
  USER_LABEL_PREFIX,
} from "@/lib/core/stream-ids";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("stream-ids – parseUserLabel", () => {
  test("extracts label from valid stream ID", () => {
    expect(parseUserLabel(`${USER_LABEL_PREFIX}Tech`)).toBe("Tech");
  });

  test("returns null for non user-label prefix", () => {
    expect(parseUserLabel("feed/https://example.com")).toBeNull();
  });

  test("returns null for empty label after prefix", () => {
    expect(parseUserLabel(USER_LABEL_PREFIX)).toBeNull();
  });

  test("preserves label with special characters", () => {
    expect(parseUserLabel(`${USER_LABEL_PREFIX}My/Label`)).toBe("My/Label");
  });

  test("constants are correct values", () => {
    expect(FEED_STREAM_PREFIX).toBe("feed/");
    expect(READING_LIST_STREAM).toBe("user/-/state/com.google/reading-list");
    expect(READ_STATE).toBe("user/-/state/com.google/read");
    expect(STARRED_STATE).toBe("user/-/state/com.google/starred");
  });
});

// ─── reader-item-id.ts ────────────────────────────────────────────────────────

describe("reader-item-id", () => {
  test("toReaderItemId converts to hex", () => {
    const result = toReaderItemId(255);
    expect(result).toContain("ff");
    expect(result).toContain("tag:google.com,2005:reader/item/");
  });

  test("toReaderItemId round-trips with parseReaderItemId", () => {
    expect(parseReaderItemId(toReaderItemId(42))).toBe(42);
    expect(parseReaderItemId(toReaderItemId(1))).toBe(1);
    expect(parseReaderItemId(toReaderItemId(9999))).toBe(9999);
  });

  test("parseReaderItemId returns null for empty string", () => {
    expect(parseReaderItemId("")).toBeNull();
    expect(parseReaderItemId("   ")).toBeNull();
  });

  test("parseReaderItemId handles decimal fallback", () => {
    // "42" can be parsed as both hex(66) and decimal(42) — hex takes priority
    expect(parseReaderItemId("tag:google.com,2005:reader/item/42")).toBe(66);
  });

  test("parseReaderItemId returns null for zero", () => {
    // "0" as hex = 0, which is not > 0
    expect(parseReaderItemId("0")).toBeNull();
  });

  test("parseReaderItemId handles bare hex", () => {
    expect(parseReaderItemId("ff")).toBe(255);
  });
});

// ─── greader stream utils ─────────────────────────────────────────────────────

describe("greader stream – parseStreamPaging", () => {
  test("returns defaults with no params", () => {
    const params = new URLSearchParams();
    const result = parseStreamPaging(params, "SomeClient/1.0");
    expect(result.limit).toBeGreaterThan(0);
    expect(result.offset).toBe(0);
    expect(result.continuationId).toBeNull();
    expect(result.isNetNewsWire).toBe(false);
  });

  test("detects NetNewsWire user agent", () => {
    const params = new URLSearchParams();
    const result = parseStreamPaging(params, "NetNewsWire/6.0");
    expect(result.isNetNewsWire).toBe(true);
  });

  test("respects n parameter", () => {
    const params = new URLSearchParams({ n: "10" });
    const result = parseStreamPaging(params, "Client/1.0");
    expect(result.limit).toBe(10);
  });

  test("caps limit to max stream items", () => {
    const params = new URLSearchParams({ n: "99999" });
    const result = parseStreamPaging(params, "Client/1.0");
    expect(result.limit).toBeLessThanOrEqual(250);
  });

  test("parses offset continuation", () => {
    const params = new URLSearchParams({ c: "offset:50" });
    const result = parseStreamPaging(params, "Client/1.0");
    expect(result.offset).toBe(50);
    expect(result.continuationId).toBeNull();
  });

  test("parses numeric continuation ID", () => {
    const params = new URLSearchParams({ c: "100" });
    const result = parseStreamPaging(params, "Client/1.0");
    expect(result.continuationId).toBe(100);
    expect(result.offset).toBe(0);
  });

  test("ignores invalid continuation", () => {
    const params = new URLSearchParams({ c: "invalid" });
    const result = parseStreamPaging(params, "Client/1.0");
    expect(result.offset).toBe(0);
    expect(result.continuationId).toBeNull();
  });

  test("ignores negative offset continuation", () => {
    const params = new URLSearchParams({ c: "offset:-5" });
    const result = parseStreamPaging(params, "Client/1.0");
    expect(result.offset).toBe(0);
  });
});

describe("greader stream – parseStreamId", () => {
  test("extracts stream ID from resource path", () => {
    const result = parseStreamId(
      "stream/contents/feed/https://example.com/rss",
    );
    expect(result).toBe("feed/https://example.com/rss");
  });

  test("handles encoded stream ID", () => {
    const result = parseStreamId(
      "stream/contents/user%2F-%2Fstate%2Fcom.google%2Freading-list",
    );
    expect(result).toBe("user/-/state/com.google/reading-list");
  });
});

describe("greader stream – parseOlderThanDate", () => {
  test("returns Date for valid timestamp", () => {
    const params = new URLSearchParams({ ot: "1700000000" });
    const result = parseOlderThanDate(params);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(1700000000 * 1000);
  });

  test("returns null for missing ot", () => {
    const params = new URLSearchParams();
    expect(parseOlderThanDate(params)).toBeNull();
  });

  test("returns null for negative ot", () => {
    const params = new URLSearchParams({ ot: "-1" });
    expect(parseOlderThanDate(params)).toBeNull();
  });

  test("returns null for zero ot", () => {
    const params = new URLSearchParams({ ot: "0" });
    expect(parseOlderThanDate(params)).toBeNull();
  });

  test("returns null for non-numeric ot", () => {
    const params = new URLSearchParams({ ot: "abc" });
    expect(parseOlderThanDate(params)).toBeNull();
  });
});

describe("greader stream – shouldExcludeReadFromStream", () => {
  test("returns true when read state is in excluded tags", () => {
    expect(shouldExcludeReadFromStream([READ_STATE])).toBe(true);
  });

  test("returns false when read not in excluded tags", () => {
    expect(shouldExcludeReadFromStream([])).toBe(false);
  });

  test("returns true for any stream when read is excluded", () => {
    expect(shouldExcludeReadFromStream([READ_STATE])).toBe(true);
  });
});

// ─── ssrf.ts ──────────────────────────────────────────────────────────────────

describe("reader-api – parseReaderStreamItems", () => {
  test("returns items from valid response", () => {
    const result = parseReaderStreamItems({ items: [{ id: "1" }] });
    expect(result).toHaveLength(1);
  });

  test("returns empty array for undefined", () => {
    expect(parseReaderStreamItems(undefined)).toEqual([]);
  });

  test("returns empty array for missing items", () => {
    expect(parseReaderStreamItems({} as any)).toEqual([]);
  });

  test("returns empty array for non-array items", () => {
    expect(parseReaderStreamItems({ items: "not-array" } as any)).toEqual([]);
  });
});

describe("reader-api – readerItemToArticle", () => {
  test("converts basic item to Article", () => {
    const article = readerItemToArticle(
      {
        id: "tag:google.com,2005:reader/item/ff",
        title: "Test Article",
        published: 1700000000,
        canonical: [{ href: "https://example.com/article" }],
        summary: { content: "<p>Content</p>" },
        origin: {
          streamId: "feed/https://example.com/feed",
          title: "Example Feed",
          htmlUrl: "https://example.com",
        },
        categories: [],
      },
      0,
    );
    expect(article.title).toBe("Test Article");
    expect(article.link).toBe("https://example.com/article");
    expect(article.content).toBe("<p>Content</p>");
    expect(article.feedName).toBe("Example Feed");
    expect(article.feedUrl).toBe("https://example.com");
    expect(article.isRead).toBe(false);
    expect(article.isStarred).toBe(false);
  });

  test("marks article as read when read state in categories", () => {
    const article = readerItemToArticle(
      {
        title: "Read",
        canonical: [{ href: "https://example.com/1" }],
        categories: [READ_STATE],
      },
      0,
    );
    expect(article.isRead).toBe(true);
  });

  test("marks article as starred", () => {
    const article = readerItemToArticle(
      {
        title: "Starred",
        canonical: [{ href: "https://example.com/2" }],
        categories: [STARRED_STATE],
      },
      0,
    );
    expect(article.isStarred).toBe(true);
  });

  test("uses alternate link when canonical missing", () => {
    const article = readerItemToArticle(
      {
        title: "Test",
        alternate: [{ href: "https://alternate.com/article" }],
      },
      0,
    );
    expect(article.link).toBe("https://alternate.com/article");
  });

  test("uses fallback link when no canonical or alternate", () => {
    const article = readerItemToArticle({ title: "Test" }, 5);
    expect(article.link).toBe("about:reader-item-5");
  });

  test("uses updated when published missing", () => {
    const article = readerItemToArticle(
      {
        title: "Test",
        updated: 1700000000,
        canonical: [{ href: "https://example.com" }],
      },
      0,
    );
    expect(article.publicationDate.getTime()).toBe(1700000000 * 1000);
  });

  test("defaults to Untitled for missing title", () => {
    const article = readerItemToArticle({}, 0);
    expect(article.title).toBe("Untitled");
  });

  test("extracts feed URL from origin htmlUrl", () => {
    const article = readerItemToArticle(
      {
        origin: {
          htmlUrl: "https://blog.com",
          streamId: "feed/https://blog.com/rss",
        },
        canonical: [{ href: "https://blog.com/post" }],
      },
      0,
    );
    expect(article.feedUrl).toBe("https://blog.com");
  });

  test("falls back to streamId for feed URL when htmlUrl missing", () => {
    const article = readerItemToArticle(
      {
        origin: { streamId: "feed/https://blog.com/rss" },
        canonical: [{ href: "https://blog.com/post" }],
      },
      0,
    );
    expect(article.feedUrl).toBe("https://blog.com/rss");
  });

  test("sanitizes tiny placeholder image in reader summary content", () => {
    const article = readerItemToArticle(
      {
        title: "BBC style image",
        canonical: [{ href: "https://example.com/article" }],
        summary: {
          content:
            '<img src="https://static.files.bbci.co.uk/bbcdotcom/web/grey-placeholder.png" width="150" height="84" /><p>Story text</p>',
        },
      },
      0,
    );

    expect(article.content).not.toContain("grey-placeholder.png");
    expect(article.content).toContain("Story text");
  });
});

// ─── greader mappers ──────────────────────────────────────────────────────────

describe("greader mappers – toReaderIconUrl", () => {
  test("returns google favicon URL for valid feed URL", () => {
    const result = toReaderIconUrl("https://example.com/feed");
    expect(result).toContain("google.com/s2/favicons");
    expect(result).toContain("example.com");
  });

  test("returns null for invalid URL", () => {
    expect(toReaderIconUrl("not-a-url")).toBeNull();
  });
});

describe("greader mappers – mapArticleAsItem", () => {
  test("maps article to GReader item format", () => {
    const row = {
      articleId: 42,
      title: "Test",
      link: "https://example.com/article",
      content: "<p>Content</p>",
      publicationDate: new Date("2024-01-15T12:00:00Z"),
      sourceName: "Example Feed",
      sourceUrl: "https://example.com/feed",
      category: "Tech",
      isRead: true,
      isStarred: false,
    };

    const item = mapArticleAsItem(row);
    expect(item.title).toBe("Test");
    expect(item.canonical[0].href).toBe("https://example.com/article");
    expect(item.summary.content).toBe("<p>Content</p>");
    expect(item.origin.title).toBe("Example Feed");
    expect(item.categories).toContain("user/-/state/com.google/read");
  });

  test("uses default category for null category", () => {
    const row = {
      articleId: 1,
      title: "Test",
      link: "https://example.com",
      content: "",
      publicationDate: new Date(),
      sourceName: "Feed",
      sourceUrl: "https://example.com/feed",
      category: null,
      isRead: false,
      isStarred: true,
    };

    const item = mapArticleAsItem(row);
    expect(
      item.categories.some((c: string) => c.includes("label/My Feeds")),
    ).toBe(true);
    expect(item.categories).toContain("user/-/state/com.google/starred");
  });
});

// ─── greader categories utils ─────────────────────────────────────────────────

describe("greader categories – resolveCategoryWithFallback", () => {
  test("returns trimmed category", () => {
    expect(resolveCategoryWithFallback("  Tech  ", null, new Map())).toBe(
      "Tech",
    );
  });

  test("uses fallback map when category is empty", () => {
    const fallback = new Map([["example.com/feed", "News"]]);
    expect(
      resolveCategoryWithFallback("", "https://example.com/feed", fallback),
    ).toBe("News");
  });

  test("returns null when no fallback and no category", () => {
    expect(resolveCategoryWithFallback(null, null, new Map())).toBeNull();
  });

  test("returns null for empty feedUrl", () => {
    expect(resolveCategoryWithFallback("", "", new Map())).toBeNull();
  });
});

// ─── config.ts ────────────────────────────────────────────────────────────────
