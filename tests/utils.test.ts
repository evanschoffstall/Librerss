/**
 * Unit Tests: Core Utilities
 * Tests for src/lib/utils/
 */

import { Logger } from "@/lib/logger";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

// ─── Date Utils ───────────────────────────────────────────────────────────────

describe("date-utils", () => {
  test("formatRelativeDate returns formatted date string", async () => {
    const { formatRelativeDate } = await import("@/lib/utils/date-utils");
    const now = new Date();
    const result = formatRelativeDate(now);
    expect(result).toMatch(/^Today\s.+/);
  });

  test("formatRelativeDate handles past dates", async () => {
    const { formatRelativeDate } = await import("@/lib/utils/date-utils");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = formatRelativeDate(yesterday);
    expect(result).toMatch(/^Yesterday\s.+|^1 days ago$/);
  });
});

// ─── Validation Utils ─────────────────────────────────────────────────────────

describe("validation", () => {
  test("isValidEmail accepts valid emails", async () => {
    const { isValidEmail } = await import("@/lib/utils/validation");
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test.user+tag@subdomain.example.com")).toBe(true);
  });

  test("isValidEmail rejects invalid emails", async () => {
    const { isValidEmail } = await import("@/lib/utils/validation");
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  test("isStrongPassword rejects weak passwords", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    expect(isStrongPassword("short")).toBe(false);
    expect(isStrongPassword("alllowercase")).toBe(false);
    expect(isStrongPassword("NoNumbers")).toBe(false);
  });

  test("isStrongPassword accepts strong passwords", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    expect(isStrongPassword("ValidPass123!")).toBe(true);
    expect(isStrongPassword("Str0ng!Pass")).toBe(true);
  });
});

// ─── URL Utils ────────────────────────────────────────────────────────────────

describe("url utils", () => {
  test("isValidUrl accepts http/https URLs", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://example.com/path")).toBe(true);
  });

  test("isValidUrl rejects dangerous protocols", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
    expect(isValidUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isValidUrl("file:///etc/passwd")).toBe(false);
  });

  test("tryGetUrlHostname extracts hostname", async () => {
    const { tryGetUrlHostname } = await import("@/lib/utils/url");
    expect(tryGetUrlHostname("https://example.com/path")).toBe("example.com");
    expect(tryGetUrlHostname("http://subdomain.example.com")).toBe(
      "subdomain.example.com",
    );
  });

  test("tryGetUrlHostname returns null for invalid URL", async () => {
    const { tryGetUrlHostname } = await import("@/lib/utils/url");
    expect(tryGetUrlHostname("not-a-url")).toBeNull();
  });

  test("getUrlHostnameLabel formats hostname display", async () => {
    const { getUrlHostnameLabel } = await import("@/lib/utils/url");
    const result = getUrlHostnameLabel("https://www.example.com/path");
    expect(result).toBe("www.example.com");
  });

  test("normalizeFeedUrl strips credentials", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    const result = normalizeFeedUrl(
      `https://${"user"}:${"pass"}@example.com/feed`,
    );
    expect(result).not.toContain("user");
    expect(result).not.toContain("pass");
    expect(result).toContain("example.com");
  });

  test("normalizeFeedUrl strips hash fragments", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    const result = normalizeFeedUrl("https://example.com/feed#section");
    expect(result).not.toContain("#");
  });

  test("normalizeFeedUrl preserves query parameters", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    const result = normalizeFeedUrl("https://example.com/feed?format=rss");
    expect(result).toContain("format=rss");
  });

  test("tryNormalizeFeedUrl falls back for invalid URLs", async () => {
    const { tryNormalizeFeedUrl } = await import("@/lib/utils/url");
    expect(tryNormalizeFeedUrl("  not-a-url///  ")).toBe("not-a-url");
  });

  test("normalizeDistinctUrlList filters, trims, and deduplicates", async () => {
    const { normalizeDistinctUrlList } = await import("@/lib/utils/url");
    expect(normalizeDistinctUrlList(null)).toEqual([]);
    expect(
      normalizeDistinctUrlList([
        " https://example.com ",
        "https://example.com",
        "",
        "   ",
        42,
      ]),
    ).toEqual(["https://example.com"]);
  });

  test("tryGetUrlHostname handles empty and trailing dot hostnames", async () => {
    const { tryGetUrlHostname } = await import("@/lib/utils/url");
    expect(tryGetUrlHostname("")).toBeNull();
    expect(tryGetUrlHostname("https://Example.com.")).toBe("example.com");
  });

  test("getUrlHostnameLabel falls back for invalid and missing URLs", async () => {
    const { getUrlHostnameLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameLabel(undefined, "fallback")).toBe("fallback");
    expect(getUrlHostnameLabel("not-a-url")).toBe("not-a-url");
  });

  test("toCategoryLookupKey normalizes valid feed URLs", async () => {
    const { toCategoryLookupKey } = await import("@/lib/utils/url");
    expect(toCategoryLookupKey(" https://Example.com/path///?a=1#hash ")).toBe(
      "example.com/path?a=1",
    );
    expect(toCategoryLookupKey("HTTP://Example.com///")).toBe("example.com/");
  });

  test("toCategoryLookupKey handles empty and non-URL inputs", async () => {
    const { toCategoryLookupKey } = await import("@/lib/utils/url");
    expect(toCategoryLookupKey("Example.com///")).toBe("example.com");
    expect(toCategoryLookupKey("   ")).toBe("");
  });
});

// ─── Logger ───────────────────────────────────────────────────────────────────

describe("logger", () => {
  test("logger instance exists and has methods", () => {
    const logger = new Logger();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
    logger.debug("debug-smoke");
  });

  test("logger sanitizes sensitive fields and logs all levels", () => {
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";

    const logger = new Logger();

    const context = {
      email: "alice@example.com",
      password: "secret-pass",
      nested: { token: "abc123", when: new Date("2024-01-01T00:00:00.000Z") },
      list: [{ apiKey: "xyz" }],
      error: new Error("boom"),
    };

    try {
      const formattedInfo = (logger as any).formatMessage(
        "info",
        "hello",
        (logger as any).sanitizeContext(context),
      );
      const formattedWarn = (logger as any).formatMessage(
        "warn",
        "warn",
        (logger as any).sanitizeContext({ sessionToken: "token-value" }),
      );
      const formattedError = (logger as any).formatMessage(
        "error",
        "error",
        (logger as any).sanitizeContext({ cookie: "session-cookie" }),
      );

      const output = [formattedInfo, formattedWarn, formattedError].join("\n");
      let plainOutput = "";
      for (let index = 0; index < output.length; index += 1) {
        if (output.charCodeAt(index) === 27) {
          while (index < output.length && output[index] !== "m") {
            index += 1;
          }
          continue;
        }
        plainOutput += output[index];
      }

      expect(plainOutput).toContain("[INFO] hello");
      expect(plainOutput).toContain("[WARN] warn");
      expect(plainOutput).toContain("[ERROR] error");
      expect(plainOutput).toContain('"password": "[redacted]"');
      expect(plainOutput).toContain('"token": "[redacted]"');
      expect(plainOutput).toContain('"apiKey": "[redacted]"');
      expect(plainOutput).toContain('"cookie": "[redacted]"');
      expect(plainOutput).toContain('"email": "al***@example.com"');
      expect(plainOutput).toContain('"timestamp":');
      expect(plainOutput).toContain('"message": "boom"');
    } finally {
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  test("logger truncates deeply nested context values", () => {
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";

    const logger = new Logger();

    const originalLog = console.log;
    let captured = "";
    console.log = (message?: unknown) => {
      captured = String(message);
    };

    try {
      logger.info("deep", {
        lvl1: {
          lvl2: {
            lvl3: {
              lvl4: {
                lvl5: {
                  lvl6: {
                    lvl7: "too-deep",
                  },
                },
              },
            },
          },
        },
      });
    } finally {
      console.log = originalLog;
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }

    expect(captured).toContain("[truncated]");
  });
});

// ─── Error Utils ──────────────────────────────────────────────────────────────

describe("errors", () => {
  test("toErrorMessage extracts error message", async () => {
    const { toErrorMessage } = await import("@/lib/utils/errors");
    const message = toErrorMessage(new Error("Test error"));
    expect(message).toBe("Test error");
  });

  test("toError converts unknown to Error", async () => {
    const { toError } = await import("@/lib/utils/errors");
    const error = toError("string error");
    expect(error instanceof Error).toBe(true);
  });
});

// ─── Categories ───────────────────────────────────────────────────────────────

describe("categories", () => {
  test("normalizeCategory normalizes label", async () => {
    const { normalizeCategory } = await import("@/lib/utils/categories");
    const result = normalizeCategory("Tech");
    expect(result).toBe("Tech");
  });

  test("normalizeCategoryLabelKey creates lookup key", async () => {
    const { normalizeCategoryLabelKey } =
      await import("@/lib/utils/categories");
    const key = normalizeCategoryLabelKey("Tech");
    expect(key).toBe("tech");
  });

  test("isSameCategoryLabel compares labels", async () => {
    const { isSameCategoryLabel } = await import("@/lib/utils/categories");
    expect(isSameCategoryLabel("Tech", "Tech")).toBe(true);
    expect(isSameCategoryLabel("Tech", "News")).toBe(false);
  });

  test("normalizeCategory maps empty and uncategorized variants to default", async () => {
    const { normalizeCategory, DEFAULT_CATEGORY_LABEL } =
      await import("@/lib/utils/categories");
    expect(normalizeCategory(undefined)).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory("   ")).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory("Uncategorized")).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory("uncategoried")).toBe(DEFAULT_CATEGORY_LABEL);
    expect(normalizeCategory("No Category")).toBe(DEFAULT_CATEGORY_LABEL);
  });

  test("normalizeCategory keeps explicit non-default labels trimmed", async () => {
    const { normalizeCategory } = await import("@/lib/utils/categories");
    expect(normalizeCategory("  Tech  ")).toBe("Tech");
  });

  test("category array helpers and lookup behave case-insensitively", async () => {
    const {
      includesCategoryLabel,
      replaceCategoryLabel,
      removeCategoryLabel,
      findCategoryByLabel,
    } = await import("@/lib/utils/categories");

    expect(includesCategoryLabel(["Tech", "News"], " tech ")).toBe(true);
    expect(replaceCategoryLabel(["Tech", "News"], "tech", "Updates")).toEqual([
      "Updates",
      "News",
    ]);
    expect(removeCategoryLabel(["Tech", "News"], " news ")).toEqual(["Tech"]);
    expect(
      findCategoryByLabel(
        [
          { key: "tech", label: "Tech" },
          { key: "news", label: "News" },
        ],
        "tech",
      )?.label,
    ).toBe("Tech");
  });
});

// ─── OPML ─────────────────────────────────────────────────────────────────────

describe("opml", () => {
  test("parseOpmlFeedImport extracts feeds from valid OPML", async () => {
    if (typeof DOMParser === "undefined") {
      return;
    }

    const { parseOpmlFeedImport } = await import("@/lib/utils/opml");
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="Example Feed" title="Example Feed" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com" />
    </outline>
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({
      url: "https://example.com/feed.xml",
      category: "Tech",
    });
  });
});
