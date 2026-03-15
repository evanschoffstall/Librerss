import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

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
  injectProxyCredentials,
  isValidUrl,
  normalizeDistinctUrlList,
  normalizeFeedUrl,
  redactUrlForLogs,
  tryGetUrlHostname,
  tryNormalizeFeedUrl,
} from "@/lib/utils/url";

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

// ── utils/url – redactUrlForLogs ─────────────────────────────────────────────

describe("utils/url – redactUrlForLogs", () => {
  test("strips credentials and hash from URL", () => {
    // Build the URL with injected credentials to avoid hardcoding basic-auth
    // in source (secretlint false positive prevention).
    const url = new URL("https://example.com/path?q=1#section");
    url.username = "user";
    url.password = "pass";
    const result = redactUrlForLogs(url.toString());
    expect(result).toBe("https://example.com/path");
  });

  test("returns [empty-url] for blank input", () => {
    expect(redactUrlForLogs("   ")).toBe("[empty-url]");
  });

  test("returns [invalid-url] for totally invalid input", () => {
    expect(redactUrlForLogs("not a url at all @@##")).toBe("[invalid-url]");
  });

  test("handles non-special schemes (socks5)", () => {
    const result = redactUrlForLogs("socks5://proxy.example.com:1080/");
    expect(result).toContain("proxy.example.com");
    expect(result).not.toContain("null");
  });

  test("strips query string", () => {
    const result = redactUrlForLogs(
      "https://api.example.com/endpoint?key=secret&token=abc",
    );
    expect(result).toBe("https://api.example.com/endpoint");
  });
});

// ── utils/url – injectProxyCredentials ──────────────────────────────────────

describe("utils/url – injectProxyCredentials", () => {
  test("injects username and password into URL", () => {
    const result = injectProxyCredentials(
      "http://proxy.example.com:8080",
      "alice",
      "secret",
    );
    expect(result).toContain("alice");
    expect(result).toContain("proxy.example.com:8080");
  });

  test("URL-encodes special characters in credentials", () => {
    const result = injectProxyCredentials(
      "http://proxy.example.com:8080",
      "user@domain",
      "p@ss!word",
    );
    expect(result).not.toContain("@domain");
    expect(result).toContain("proxy.example.com");
  });

  test("returns original URL when proxy URL is invalid", () => {
    const bad = "not-a-url";
    const result = injectProxyCredentials(bad, "user", "pass");
    expect(result).toBe(bad);
  });
});

describe("lib/utils/url", () => {
  test("isValidUrl accepts http URLs", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("http://example.com")).toBe(true);
    expect(isValidUrl("http://example.com/path")).toBe(true);
  });

  test("isValidUrl accepts https URLs", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("https://secure.example.com")).toBe(true);
  });

  test("isValidUrl rejects non-http protocols", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("ftp://example.com")).toBe(false);
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
    expect(isValidUrl("data:text/html,test")).toBe(false);
    expect(isValidUrl("file:///etc/passwd")).toBe(false);
  });

  test("isValidUrl rejects invalid URLs", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("not a url")).toBe(false);
    expect(isValidUrl("")).toBe(false);
    expect(isValidUrl("htp://broken")).toBe(false);
  });

  test("normalizeFeedUrl strips hash", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    expect(normalizeFeedUrl("https://example.com/feed#hash")).toBe(
      "https://example.com/feed",
    );
  });

  test("normalizeFeedUrl strips credentials", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    expect(
      normalizeFeedUrl(`https://${"user"}:${"pass"}@example.com/feed`),
    ).toBe("https://example.com/feed");
  });

  test("normalizeFeedUrl strips trailing slashes", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    expect(normalizeFeedUrl("https://example.com/feed/")).toBe(
      "https://example.com/feed",
    );
    expect(normalizeFeedUrl("https://example.com/feed///")).toBe(
      "https://example.com/feed",
    );
  });

  test("normalizeFeedUrl preserves query params", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    expect(normalizeFeedUrl("https://example.com/feed?format=xml")).toBe(
      "https://example.com/feed?format=xml",
    );
  });

  test("normalizeFeedUrl throws on invalid URL", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    expect(() => normalizeFeedUrl("not a url")).toThrow();
  });

  test("tryNormalizeFeedUrl returns fallback on error", async () => {
    const { tryNormalizeFeedUrl } = await import("@/lib/utils/url");
    expect(tryNormalizeFeedUrl("not a url")).toBe("not a url");
    expect(tryNormalizeFeedUrl("  invalid  ")).toBe("invalid");
  });

  test("tryNormalizeFeedUrl normalizes valid URLs", async () => {
    const { tryNormalizeFeedUrl } = await import("@/lib/utils/url");
    expect(tryNormalizeFeedUrl("https://example.com/feed#hash")).toBe(
      "https://example.com/feed",
    );
  });

  test("normalizeDistinctUrlList returns empty for non-arrays", async () => {
    const { normalizeDistinctUrlList } = await import("@/lib/utils/url");
    expect(normalizeDistinctUrlList(null)).toEqual([]);
    expect(normalizeDistinctUrlList(undefined)).toEqual([]);
    expect(normalizeDistinctUrlList("string")).toEqual([]);
    expect(normalizeDistinctUrlList(123)).toEqual([]);
  });

  test("normalizeDistinctUrlList filters non-strings", async () => {
    const { normalizeDistinctUrlList } = await import("@/lib/utils/url");
    const result = normalizeDistinctUrlList([
      "https://example.com",
      123,
      null,
      "https://test.com",
    ]);
    expect(result).toEqual(["https://example.com", "https://test.com"]);
  });

  test("normalizeDistinctUrlList trims and dedupes URLs", async () => {
    const { normalizeDistinctUrlList } = await import("@/lib/utils/url");
    const result = normalizeDistinctUrlList([
      " https://example.com ",
      "https://example.com",
      "https://test.com",
      "  https://test.com  ",
    ]);
    expect(result).toEqual(["https://example.com", "https://test.com"]);
  });

  test("normalizeDistinctUrlList removes empty strings", async () => {
    const { normalizeDistinctUrlList } = await import("@/lib/utils/url");
    const result = normalizeDistinctUrlList([
      "https://example.com",
      "",
      "   ",
      "https://test.com",
    ]);
    expect(result).toEqual(["https://example.com", "https://test.com"]);
  });

  test("tryGetUrlHostname extracts hostname", async () => {
    const { tryGetUrlHostname } = await import("@/lib/utils/url");
    expect(tryGetUrlHostname("https://example.com/path")).toBe("example.com");
    expect(tryGetUrlHostname("http://subdomain.example.com")).toBe(
      "subdomain.example.com",
    );
  });

  test("tryGetUrlHostname returns null for invalid URLs", async () => {
    const { tryGetUrlHostname } = await import("@/lib/utils/url");
    expect(tryGetUrlHostname("not a url")).toBeNull();
    expect(tryGetUrlHostname("")).toBeNull();
    expect(tryGetUrlHostname(undefined)).toBeNull();
  });

  test("tryGetUrlHostname lowercase normalizes hostname", async () => {
    const { tryGetUrlHostname } = await import("@/lib/utils/url");
    expect(tryGetUrlHostname("https://EXAMPLE.COM")).toBe("example.com");
  });

  test("tryGetUrlHostname strips trailing dot", async () => {
    const { tryGetUrlHostname } = await import("@/lib/utils/url");
    expect(tryGetUrlHostname("https://example.com.")).toBe("example.com");
  });

  test("getUrlHostnameLabel returns hostname or fallback", async () => {
    const { getUrlHostnameLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameLabel("https://example.com")).toBe("example.com");
    expect(getUrlHostnameLabel("", "Custom fallback")).toBe("Custom fallback");
    expect(getUrlHostnameLabel(undefined)).toBe("No source URL");
  });

  test("getUrlHostnameLabel returns raw URL when hostname extraction fails", async () => {
    const { getUrlHostnameLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameLabel("invalid URL")).toBe("invalid URL");
  });
});

describe("lib/utils/validation", () => {
  test("isSafePositiveItemId accepts valid positive integers", async () => {
    const { isSafePositiveItemId } = await import("@/lib/utils/validation");
    expect(isSafePositiveItemId(1)).toBe(true);
    expect(isSafePositiveItemId(42)).toBe(true);
    expect(isSafePositiveItemId(1000000)).toBe(true);
  });

  test("isSafePositiveItemId rejects zero and negative numbers", async () => {
    const { isSafePositiveItemId } = await import("@/lib/utils/validation");
    expect(isSafePositiveItemId(0)).toBe(false);
    expect(isSafePositiveItemId(-1)).toBe(false);
    expect(isSafePositiveItemId(-42)).toBe(false);
  });

  test("isSafePositiveItemId rejects floats", async () => {
    const { isSafePositiveItemId } = await import("@/lib/utils/validation");
    expect(isSafePositiveItemId(1.5)).toBe(false);
    expect(isSafePositiveItemId(3.14159)).toBe(false);
  });

  test("isSafePositiveItemId rejects non-numbers", async () => {
    const { isSafePositiveItemId } = await import("@/lib/utils/validation");
    expect(isSafePositiveItemId("123")).toBe(false);
    expect(isSafePositiveItemId(null)).toBe(false);
    expect(isSafePositiveItemId(undefined)).toBe(false);
    expect(isSafePositiveItemId({})).toBe(false);
  });

  test("isSafePositiveItemId rejects unsafe integers", async () => {
    const { isSafePositiveItemId } = await import("@/lib/utils/validation");
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isSafePositiveItemId(Infinity)).toBe(false);
  });

  test("isValidEmail accepts valid emails", async () => {
    const { isValidEmail } = await import("@/lib/utils/validation");
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test.user@example.co.uk")).toBe(true);
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  test("isValidEmail rejects invalid emails", async () => {
    const { isValidEmail } = await import("@/lib/utils/validation");
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user @example.com")).toBe(false);
  });

  test("isValidEmail rejects overlong emails", async () => {
    const { isValidEmail } = await import("@/lib/utils/validation");
    // CONFIG.MAX_EMAIL_LENGTH is 320, so create email longer than that
    const longEmail = "a".repeat(350) + "@example.com";
    expect(isValidEmail(longEmail)).toBe(false);
  });

  test("isStrongPassword accepts strong passwords", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    expect(isStrongPassword("Password123!")).toBe(true);
    expect(isStrongPassword("MyP@ssw0rd")).toBe(true);
    expect(isStrongPassword("Str0ng!Pass")).toBe(true);
  });

  test("isStrongPassword rejects short passwords", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    expect(isStrongPassword("Pass1!")).toBe(false);
    expect(isStrongPassword("a")).toBe(false);
  });

  test("isStrongPassword rejects passwords without complexity", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    expect(isStrongPassword("passwordpassword")).toBe(false); // only lowercase
    expect(isStrongPassword("PASSWORDPASSWORD")).toBe(false); // only uppercase
    expect(isStrongPassword("12345678901234")).toBe(false); // only numbers
  });

  test("isStrongPassword rejects overlong passwords", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    // CONFIG.PASSWORD_MAX_LENGTH is 1024, so create password longer than that
    const longPassword = "Password123!" + "x".repeat(1020);
    expect(isStrongPassword(longPassword)).toBe(false);
  });

  test("isStrongPassword rejects non-string input", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    expect(isStrongPassword(null as any)).toBe(false);
    expect(isStrongPassword(undefined as any)).toBe(false);
    expect(isStrongPassword(123 as any)).toBe(false);
  });
});

describe("lib/utils/categories", () => {
  test("normalizeCategoryLabelKey returns lowercase trimmed key", async () => {
    const { normalizeCategoryLabelKey } =
      await import("@/lib/utils/categories");
    expect(normalizeCategoryLabelKey("  Tech  ")).toBe("tech");
    expect(normalizeCategoryLabelKey("NEWS")).toBe("news");
  });

  test("normalizeCategoryLabelKey handles null and undefined", async () => {
    const { normalizeCategoryLabelKey } =
      await import("@/lib/utils/categories");
    expect(normalizeCategoryLabelKey(null)).toBe("");
    expect(normalizeCategoryLabelKey(undefined)).toBe("");
  });

  test("isSameCategoryLabel compares case-insensitively", async () => {
    const { isSameCategoryLabel } = await import("@/lib/utils/categories");
    expect(isSameCategoryLabel("Tech", "tech")).toBe(true);
    expect(isSameCategoryLabel("  NEWS  ", "news")).toBe(true);
    expect(isSameCategoryLabel("Tech", "News")).toBe(false);
  });

  test("normalizeCategory returns default for empty input", async () => {
    const { DEFAULT_CATEGORY_LABEL, normalizeCategory } =
      await import("@/lib/utils/categories");
    expect(normalizeCategory("")).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory(null)).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory(undefined)).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory("   ")).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("normalizeCategory normalizes uncategorized variants", async () => {
    const { DEFAULT_CATEGORY_LABEL, normalizeCategory } =
      await import("@/lib/utils/categories");
    expect(normalizeCategory("uncategorized")).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory("Uncategorised")).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory("No Category")).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory("none")).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("normalizeCategory preserves valid category names", async () => {
    const { normalizeCategory } = await import("@/lib/utils/categories");
    expect(normalizeCategory("Tech")).toBe("Tech");
    expect(normalizeCategory("  News  ")).toBe("News");
  });

  test("includesCategoryLabel finds matching labels", async () => {
    const { includesCategoryLabel } = await import("@/lib/utils/categories");
    expect(includesCategoryLabel(["Tech", "News"], "tech")).toBe(true);
    expect(includesCategoryLabel(["Tech", "News"], "Sports")).toBe(false);
  });

  test("replaceCategoryLabel replaces matching label", async () => {
    const { replaceCategoryLabel } = await import("@/lib/utils/categories");
    const result = replaceCategoryLabel(["Tech", "News"], "tech", "Technology");
    expect(result).toEqual(["Technology", "News"]);
  });

  test("removeCategoryLabel removes matching label", async () => {
    const { removeCategoryLabel } = await import("@/lib/utils/categories");
    const result = removeCategoryLabel(["Tech", "News", "Sports"], "news");
    expect(result).toEqual(["Tech", "Sports"]);
  });

  test("findCategoryByLabel finds matching category node", async () => {
    const { findCategoryByLabel } = await import("@/lib/utils/categories");
    const categories = [
      { feedSources: [], key: "tech", label: "Tech" },
      { feedSources: [], key: "news", label: "News" },
    ];
    const result = findCategoryByLabel(categories, "tech");
    expect(result?.label).toBe("Tech");
  });

  test("findCategoryByLabel returns undefined when not found", async () => {
    const { findCategoryByLabel } = await import("@/lib/utils/categories");
    const categories = [
      { feedSources: [], key: "tech", label: "Tech" },
      { feedSources: [], key: "news", label: "News" },
    ];
    const result = findCategoryByLabel(categories, "Sports");
    expect(result).toBeUndefined();
  });
});
