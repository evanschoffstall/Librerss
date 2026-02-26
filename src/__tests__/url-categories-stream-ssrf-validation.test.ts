/**
 * Pure-function tests for URL utilities, categories, stream IDs, stream utils,
 * SSRF, reader-item-id, reader-api, GReader mappers, validation, and config.
 * All tested via real imports — no module mocking.
 */

import { resolveCategoryWithFallback } from "@/app/api/greader.php/[...segments]/services/categories";
import {
  mapArticleAsItem,
  toReaderIconUrl,
} from "@/app/api/greader.php/[...segments]/services/mappers";
import {
  parseOlderThanDate,
  parseStreamId,
  parseStreamPaging,
  shouldExcludeReadFromStream,
} from "@/app/api/greader.php/[...segments]/services/stream";
import {
  parseReaderStreamItems,
  readerItemToArticle,
} from "@/lib/api/reader-api";
import { CONFIG, ENV } from "@/lib/config";
import { parseReaderItemId, toReaderItemId } from "@/lib/core/reader-item-id";
import {
  FEED_STREAM_PREFIX,
  READING_LIST_STREAM,
  READ_STATE,
  STARRED_STATE,
  USER_LABEL_PREFIX,
  parseUserLabel,
} from "@/lib/core/stream-ids";
import {
  DEFAULT_CATEGORY_LABEL,
  findCategoryByLabel,
  includesCategoryLabel,
  isSameCategoryLabel,
  normalizeCategory,
  normalizeCategoryLabelKey,
  removeCategoryLabel,
  replaceCategoryLabel,
} from "@/lib/utils/categories";
import {
  isBlockedHost,
  isBlockedResolvedAddress,
  normalizeHostname,
} from "@/lib/utils/ssrf";
import {
  getUrlHostnameLabel,
  isValidUrl,
  normalizeDistinctUrlList,
  normalizeFeedUrl,
  redactUrlForLogs,
  toCategoryLookupKey,
  tryGetUrlHostname,
  tryNormalizeFeedUrl,
} from "@/lib/utils/url";
import { isSafePositiveItemId, isStrongPassword } from "@/lib/utils/validation";
import { describe, expect, test } from "bun:test";
// ─── url.ts ───────────────────────────────────────────────────────────────────

describe("url – isValidUrl", () => {
  test("accepts http URL", () => {
    expect(isValidUrl("http://example.com")).toBe(true);
  });

  test("accepts https URL", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
  });

  test("rejects ftp URL", () => {
    expect(isValidUrl("ftp://example.com")).toBe(false);
  });

  test("rejects javascript: scheme", () => {
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidUrl("")).toBe(false);
  });

  test("rejects malformed URL", () => {
    expect(isValidUrl("not a url")).toBe(false);
  });

  test("accepts URL with path and query", () => {
    expect(isValidUrl("https://example.com/path?q=1")).toBe(true);
  });
});

describe("url – normalizeFeedUrl", () => {
  test("strips trailing slashes", () => {
    expect(normalizeFeedUrl("https://example.com/feed/")).toBe(
      "https://example.com/feed",
    );
  });

  test("strips hash", () => {
    const result = normalizeFeedUrl("https://example.com/feed#section");
    expect(result).not.toContain("#");
  });

  test("strips credentials", () => {
    const result = normalizeFeedUrl("https://user:pass@example.com/feed");
    expect(result).not.toContain("user");
    expect(result).not.toContain("pass");
  });

  test("trims whitespace", () => {
    expect(normalizeFeedUrl("  https://example.com/feed  ")).toBe(
      "https://example.com/feed",
    );
  });

  test("throws for invalid URL", () => {
    expect(() => normalizeFeedUrl("not-valid")).toThrow();
  });
});

describe("url – tryNormalizeFeedUrl", () => {
  test("normalizes valid URL", () => {
    expect(tryNormalizeFeedUrl("https://example.com/feed/")).toBe(
      "https://example.com/feed",
    );
  });

  test("falls back to trimmed input for invalid URL", () => {
    expect(tryNormalizeFeedUrl("  not-valid  ")).toBe("not-valid");
  });

  test("strips trailing slashes from invalid URLs in fallback", () => {
    expect(tryNormalizeFeedUrl("invalid-url///")).toBe("invalid-url");
  });
});

describe("url – normalizeDistinctUrlList", () => {
  test("returns empty for non-array", () => {
    expect(normalizeDistinctUrlList("not array")).toEqual([]);
    expect(normalizeDistinctUrlList(null)).toEqual([]);
    expect(normalizeDistinctUrlList(42)).toEqual([]);
  });

  test("deduplicates URLs", () => {
    const result = normalizeDistinctUrlList([
      "https://a.com",
      "https://a.com",
      "https://b.com",
    ]);
    expect(result).toEqual(["https://a.com", "https://b.com"]);
  });

  test("filters out non-strings and empty", () => {
    const result = normalizeDistinctUrlList([
      "https://a.com",
      42,
      "",
      null,
      "https://b.com",
    ]);
    expect(result).toEqual(["https://a.com", "https://b.com"]);
  });

  test("trims whitespace", () => {
    const result = normalizeDistinctUrlList(["  https://a.com  "]);
    expect(result).toEqual(["https://a.com"]);
  });
});

describe("url – tryGetUrlHostname", () => {
  test("returns hostname for valid URL", () => {
    expect(tryGetUrlHostname("https://example.com/path")).toBe("example.com");
  });

  test("returns lowercase hostname", () => {
    expect(tryGetUrlHostname("https://EXAMPLE.COM")).toBe("example.com");
  });

  test("returns null for empty input", () => {
    expect(tryGetUrlHostname("")).toBeNull();
    expect(tryGetUrlHostname(undefined)).toBeNull();
  });

  test("returns null for invalid URL", () => {
    expect(tryGetUrlHostname("not-a-url")).toBeNull();
  });

  test("strips trailing dot", () => {
    expect(tryGetUrlHostname("https://example.com.")).toBe("example.com");
  });
});

describe("url – getUrlHostnameLabel", () => {
  test("returns hostname for valid URL", () => {
    expect(getUrlHostnameLabel("https://example.com/path")).toBe("example.com");
  });

  test("returns fallback for empty input", () => {
    expect(getUrlHostnameLabel(undefined)).toBe("No source URL");
  });

  test("returns custom fallback", () => {
    expect(getUrlHostnameLabel(undefined, "N/A")).toBe("N/A");
  });

  test("returns raw URL for unparseable input", () => {
    expect(getUrlHostnameLabel("just-text")).toBe("just-text");
  });
});

describe("url – toCategoryLookupKey", () => {
  test("returns host + path for valid URL", () => {
    expect(toCategoryLookupKey("https://example.com/feed")).toBe(
      "example.com/feed",
    );
  });

  test("strips trailing slashes from path", () => {
    expect(toCategoryLookupKey("https://example.com/feed/")).toBe(
      "example.com/feed",
    );
  });

  test("lowercases hostname", () => {
    expect(toCategoryLookupKey("https://EXAMPLE.COM/Feed")).toBe(
      "example.com/Feed",
    );
  });

  test("preserves query params", () => {
    expect(toCategoryLookupKey("https://example.com/feed?type=rss")).toBe(
      "example.com/feed?type=rss",
    );
  });

  test("returns empty for empty/whitespace input", () => {
    expect(toCategoryLookupKey("")).toBe("");
    expect(toCategoryLookupKey("   ")).toBe("");
  });

  test("falls back for invalid URL", () => {
    const result = toCategoryLookupKey("not-a-url");
    expect(result).toBe("not-a-url");
  });

  test("uses / for root path", () => {
    expect(toCategoryLookupKey("https://example.com")).toBe("example.com/");
  });
});

describe("url – redactUrlForLogs", () => {
  test("removes credentials, query, and hash", () => {
    expect(
      redactUrlForLogs("https://user:pass@example.com/path?q=secret#token"),
    ).toBe("https://example.com/path");
  });

  test("returns marker for invalid URLs", () => {
    expect(redactUrlForLogs("not-a-url")).toBe("[invalid-url]");
  });
});

// ─── categories.ts ────────────────────────────────────────────────────────────

describe("categories – normalizeCategory", () => {
  test("returns default for empty string", () => {
    expect(normalizeCategory("")).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("returns default for null", () => {
    expect(normalizeCategory(null)).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("returns default for undefined", () => {
    expect(normalizeCategory(undefined)).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("returns default for 'uncategorized'", () => {
    expect(normalizeCategory("uncategorized")).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("returns default for 'Uncategorised'", () => {
    expect(normalizeCategory("Uncategorised")).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("returns default for 'none'", () => {
    expect(normalizeCategory("none")).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("returns default for 'no category'", () => {
    expect(normalizeCategory("no category")).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("preserves real category labels", () => {
    expect(normalizeCategory("Technology")).toBe("Technology");
    expect(normalizeCategory("News")).toBe("News");
  });

  test("trims whitespace", () => {
    expect(normalizeCategory("  Tech  ")).toBe("Tech");
  });
});

describe("categories – isSameCategoryLabel", () => {
  test("matches same labels", () => {
    expect(isSameCategoryLabel("Tech", "Tech")).toBe(true);
  });

  test("matches case-insensitively", () => {
    expect(isSameCategoryLabel("Tech", "tech")).toBe(true);
    expect(isSameCategoryLabel("NEWS", "news")).toBe(true);
  });

  test("trims whitespace before comparison", () => {
    expect(isSameCategoryLabel("  Tech  ", "tech")).toBe(true);
  });

  test("treats null and empty as same", () => {
    expect(isSameCategoryLabel(null, "")).toBe(true);
    expect(isSameCategoryLabel("", null)).toBe(true);
  });

  test("rejects different labels", () => {
    expect(isSameCategoryLabel("Tech", "News")).toBe(false);
  });
});

describe("categories – normalizeCategoryLabelKey", () => {
  test("lowercases and trims", () => {
    expect(normalizeCategoryLabelKey("  TECH  ")).toBe("tech");
  });

  test("returns empty for null", () => {
    expect(normalizeCategoryLabelKey(null)).toBe("");
  });
});

describe("categories – array helpers", () => {
  test("includesCategoryLabel finds label", () => {
    expect(includesCategoryLabel(["Tech", "News"], "tech")).toBe(true);
  });

  test("includesCategoryLabel returns false for missing", () => {
    expect(includesCategoryLabel(["Tech", "News"], "Sports")).toBe(false);
  });

  test("replaceCategoryLabel replaces matching label", () => {
    expect(
      replaceCategoryLabel(["Tech", "News"], "Tech", "Technology"),
    ).toEqual(["Technology", "News"]);
  });

  test("removeCategoryLabel removes matching", () => {
    expect(removeCategoryLabel(["Tech", "News", "Sports"], "News")).toEqual([
      "Tech",
      "Sports",
    ]);
  });

  test("findCategoryByLabel finds node", () => {
    const nodes = [
      { key: "1", label: "Tech" },
      { key: "2", label: "News" },
    ];
    expect(findCategoryByLabel(nodes, "tech")?.key).toBe("1");
  });

  test("findCategoryByLabel returns undefined if not found", () => {
    const nodes = [{ key: "1", label: "Tech" }];
    expect(findCategoryByLabel(nodes, "Sports")).toBeUndefined();
  });
});

// ─── stream-ids.ts ────────────────────────────────────────────────────────────

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
  test("returns true for reading list with read excluded", () => {
    expect(shouldExcludeReadFromStream(READING_LIST_STREAM, [READ_STATE])).toBe(
      true,
    );
  });

  test("returns false when read not in excluded tags", () => {
    expect(shouldExcludeReadFromStream(READING_LIST_STREAM, [])).toBe(false);
  });

  test("returns false for non-reading-list stream even with read excluded", () => {
    expect(
      shouldExcludeReadFromStream("feed/https://example.com", [READ_STATE]),
    ).toBe(false);
  });
});

// ─── ssrf.ts ──────────────────────────────────────────────────────────────────

describe("ssrf", () => {
  test("normalizeHostname lowercases and trims", () => {
    expect(normalizeHostname("  EXAMPLE.COM.  ")).toBe("example.com");
  });

  test("isBlockedHost blocks localhost", () => {
    expect(isBlockedHost("localhost")).toBe(true);
  });

  test("isBlockedHost blocks 127.0.0.1", () => {
    expect(isBlockedHost("127.0.0.1")).toBe(true);
  });

  test("isBlockedHost blocks 10.x.x.x", () => {
    expect(isBlockedHost("10.0.0.1")).toBe(true);
  });

  test("isBlockedHost blocks 192.168.x.x", () => {
    expect(isBlockedHost("192.168.1.1")).toBe(true);
  });

  test("isBlockedHost blocks 169.254.x.x", () => {
    expect(isBlockedHost("169.254.169.254")).toBe(true);
  });

  test("isBlockedHost blocks 172.16-31.x.x", () => {
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
  });

  test("isBlockedHost allows 172.32.x.x", () => {
    expect(isBlockedHost("172.32.0.1")).toBe(false);
  });

  test("isBlockedHost blocks ::1", () => {
    expect(isBlockedHost("::1")).toBe(true);
  });

  test("isBlockedHost blocks .local domains", () => {
    expect(isBlockedHost("myhost.local")).toBe(true);
  });

  test("isBlockedHost allows public domains", () => {
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("google.com")).toBe(false);
  });

  test("isBlockedHost blocks 0.0.0.0", () => {
    expect(isBlockedHost("0.0.0.0")).toBe(true);
  });

  test("isBlockedHost blocks empty hostname", () => {
    expect(isBlockedHost("")).toBe(true);
  });

  test("isBlockedResolvedAddress handles IPv4-mapped IPv6", () => {
    expect(isBlockedResolvedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedResolvedAddress("::ffff:8.8.8.8")).toBe(false);
  });

  test("isBlockedResolvedAddress blocks IPv4-mapped IPv6 with hex tail for private/loopback ranges", () => {
    expect(isBlockedResolvedAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedResolvedAddress("::ffff:c0a8:101")).toBe(true);
    expect(isBlockedResolvedAddress("::ffff:0808:0808")).toBe(false);
  });

  test("isBlockedResolvedAddress blocks fc addresses", () => {
    expect(isBlockedHost("fc00::1")).toBe(true);
  });

  test("isBlockedResolvedAddress blocks fd addresses", () => {
    expect(isBlockedHost("fd12::1")).toBe(true);
  });

  test("isBlockedResolvedAddress blocks fe80 link-local", () => {
    expect(isBlockedHost("fe80::1")).toBe(true);
  });
});

// ─── validation.ts ────────────────────────────────────────────────────────────

describe("validation – isSafePositiveItemId", () => {
  test("accepts positive integer", () => {
    expect(isSafePositiveItemId(1)).toBe(true);
    expect(isSafePositiveItemId(42)).toBe(true);
  });

  test("rejects zero", () => {
    expect(isSafePositiveItemId(0)).toBe(false);
  });

  test("rejects negative", () => {
    expect(isSafePositiveItemId(-1)).toBe(false);
  });

  test("rejects float", () => {
    expect(isSafePositiveItemId(1.5)).toBe(false);
  });

  test("rejects string", () => {
    expect(isSafePositiveItemId("42")).toBe(false);
  });

  test("rejects null/undefined", () => {
    expect(isSafePositiveItemId(null)).toBe(false);
    expect(isSafePositiveItemId(undefined)).toBe(false);
  });

  test("rejects Infinity", () => {
    expect(isSafePositiveItemId(Infinity)).toBe(false);
  });

  test("rejects NaN", () => {
    expect(isSafePositiveItemId(NaN)).toBe(false);
  });

  test("rejects beyond MAX_SAFE_INTEGER", () => {
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  test("accepts MAX_SAFE_INTEGER", () => {
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});

describe("validation – isStrongPassword", () => {
  test("accepts strong password", () => {
    expect(isStrongPassword("MyP@ss123")).toBe(true);
  });

  test("rejects short password", () => {
    expect(isStrongPassword("Aa1!")).toBe(false);
  });

  test("rejects password with only lowercase", () => {
    expect(isStrongPassword("abcdefgh")).toBe(false);
  });

  test("accepts password with 3 of 4 types", () => {
    expect(isStrongPassword("MyPass123")).toBe(true); // upper + lower + digit
    expect(isStrongPassword("mypass1!")).toBe(true); // lower + digit + special
  });

  test("rejects null", () => {
    expect(isStrongPassword(null as any)).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isStrongPassword("")).toBe(false);
  });

  test("rejects overlong password", () => {
    expect(isStrongPassword("A1!" + "a".repeat(1025))).toBe(false);
  });
});

// ─── reader-api.ts ────────────────────────────────────────────────────────────

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

describe("config", () => {
  test("CONFIG has required keys", () => {
    expect(CONFIG.FEED_CACHE_TTL_MINUTES).toBeGreaterThan(0);
    expect(CONFIG.MAX_ARTICLE_CONTENT_LENGTH).toBeGreaterThan(0);
    expect(CONFIG.MAX_ARTICLE_TITLE_LENGTH).toBeGreaterThan(0);
    expect(CONFIG.PASSWORD_MIN_LENGTH).toBeGreaterThan(0);
    expect(CONFIG.SESSION_DURATION_DAYS).toBeGreaterThan(0);
    expect(CONFIG.OPML_MAX_IMPORT_ENTRIES).toBeGreaterThan(0);
  });

  test("CONFIG.LOG_LEVEL is a valid level", () => {
    expect(["none", "error", "warn", "info", "verbose"]).toContain(
      CONFIG.LOG_LEVEL,
    );
  });

  test("CONFIG rate limit values are positive", () => {
    expect(CONFIG.RATE_LIMIT_LOGIN_WINDOW_MS).toBeGreaterThan(0);
    expect(CONFIG.RATE_LIMIT_LOGIN_MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(CONFIG.RATE_LIMIT_SIGNUP_WINDOW_MS).toBeGreaterThan(0);
    expect(CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS).toBeGreaterThan(0);
  });

  test("CONFIG GReader values are consistent", () => {
    expect(CONFIG.GREADER_MAX_STREAM_ITEMS).toBeGreaterThan(0);
    expect(CONFIG.GREADER_DEFAULT_STREAM_ITEMS).toBeGreaterThan(0);
    expect(CONFIG.GREADER_DEFAULT_STREAM_ITEMS).toBeLessThanOrEqual(
      CONFIG.GREADER_MAX_STREAM_ITEMS,
    );
  });

  test("ENV flags are booleans", () => {
    expect(typeof ENV.isDevelopment).toBe("boolean");
  });
});
