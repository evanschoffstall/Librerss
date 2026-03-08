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
  getUrlHostnameLabel,
  isValidUrl,
  normalizeDistinctUrlList,
  normalizeFeedUrl,
  redactUrlForLogs,
  toCategoryLookupKey,
  tryGetUrlHostname,
  tryNormalizeFeedUrl,
} from "@/lib/utils/url";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
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
    const result = normalizeFeedUrl(
      `https://${"user"}:${"pass"}@example.com/feed`,
    );
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
      redactUrlForLogs(
        `https://${"user"}:${"pass"}@example.com/path?q=secret#token`,
      ),
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
