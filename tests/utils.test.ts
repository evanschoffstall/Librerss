/**
 * Unit Tests: Core Utilities
 * Tests for src/lib/utils/
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { Logger, logger } from "@/lib/logger";
import { formatRelativeDate } from "@/lib/utils/dates";
import { toError, toErrorMessage } from "@/lib/utils/errors";
import { getUrlHostnameDisplayLabel } from "@/lib/utils/url";
import { isSafePositiveItemId } from "@/lib/utils/validation";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

// ─── Date Utils ───────────────────────────────────────────────────────────────

describe("date-utils", () => {
  test("formatRelativeDate returns formatted date string", async () => {
    const { formatRelativeDate } = await import("@/lib/utils/dates");
    const now = new Date();
    const result = formatRelativeDate(now);
    expect(result).toMatch(/^Today\s.+/);
  });

  test("formatRelativeDate handles past dates", async () => {
    const { formatRelativeDate } = await import("@/lib/utils/dates");
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
      error: new Error("boom"),
      list: [{ apiKey: "xyz" }],
      nested: { token: "abc123", when: new Date("2024-01-01T00:00:00.000Z") },
      password: "secret-pass",
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
    const { DEFAULT_CATEGORY_LABEL, normalizeCategory } =
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
      findCategoryByLabel,
      includesCategoryLabel,
      removeCategoryLabel,
      replaceCategoryLabel,
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
      category: "Tech",
      url: "https://example.com/feed.xml",
    });
  });
});

// ── lib/utils/dates – formatRelativeDate / parseDateOrNull ───────────────────

describe("lib/utils/dates – formatRelativeDate", () => {
  test("returns 'Today ...' for today", async () => {
    const { formatRelativeDate } = await import("@/lib/utils/dates");
    expect(formatRelativeDate(new Date())).toMatch(/^Today /);
  });

  test("returns 'Yesterday ...' for yesterday", async () => {
    const { formatRelativeDate } = await import("@/lib/utils/dates");
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(formatRelativeDate(d)).toMatch(/^Yesterday /);
  });

  test("returns 'N days ago' for dates 2–6 days ago", async () => {
    const { formatRelativeDate } = await import("@/lib/utils/dates");
    const d = new Date();
    d.setDate(d.getDate() - 3);
    expect(formatRelativeDate(d)).toBe("3 days ago");
  });

  test("returns locale date string for dates older than 6 days", async () => {
    const { formatRelativeDate } = await import("@/lib/utils/dates");
    const result = formatRelativeDate(new Date("2020-01-01T00:00:00.000Z"));
    expect(result).not.toMatch(/^(Today|Yesterday|\d+ days ago)/);
  });
});

describe("lib/utils/dates – parseDateOrNull and parseDateOrFallback", () => {
  test("parseDateOrNull returns null for non-date inputs", async () => {
    const { parseDateOrNull } = await import("@/lib/utils/dates");
    expect(parseDateOrNull(null)).toBeNull();
    expect(parseDateOrNull(42)).toBeNull();
    expect(parseDateOrNull("not-a-date")).toBeNull();
  });

  test("parseDateOrNull parses a valid ISO date string", async () => {
    const { parseDateOrNull } = await import("@/lib/utils/dates");
    const result = parseDateOrNull("2023-06-15T12:00:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2023);
  });

  test("parseDateOrFallback returns fallback for invalid input", async () => {
    const { parseDateOrFallback } = await import("@/lib/utils/dates");
    const fallback = new Date("2000-01-01");
    expect(parseDateOrFallback("not-a-date", fallback)).toBe(fallback);
  });
});

// ── lib/utils/validation – isSafePositiveItemId, isValidEmail, isStrongPassword

describe("lib/utils/validation – validation helpers", () => {
  test("isSafePositiveItemId rejects non-numbers and edge cases", async () => {
    const { isSafePositiveItemId } = await import("@/lib/utils/validation");
    expect(isSafePositiveItemId("1")).toBe(false);
    expect(isSafePositiveItemId(0)).toBe(false);
    expect(isSafePositiveItemId(-1)).toBe(false);
    expect(isSafePositiveItemId(1.5)).toBe(false);
  });

  test("isSafePositiveItemId accepts safe positive integers", async () => {
    const { isSafePositiveItemId } = await import("@/lib/utils/validation");
    expect(isSafePositiveItemId(1)).toBe(true);
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  test("isValidEmail validates format and length", async () => {
    const { isValidEmail } = await import("@/lib/utils/validation");
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  test("isStrongPassword enforces complexity requirements", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    expect(isStrongPassword("Abcdef1!")).toBe(true);
    expect(isStrongPassword("password")).toBe(false);
    expect(isStrongPassword("ALLUPPERCASE12!")).toBe(true);
  });
});

// ─── logger.ts ────────────────────────────────────────────────────────────────

describe("logger", () => {
  test("logger.info does not throw", () => {
    expect(() => logger.info("test message")).not.toThrow();
  });

  test("logger.warn does not throw", () => {
    expect(() => logger.warn("warning message")).not.toThrow();
  });

  test("logger.error does not throw", () => {
    expect(() => logger.error("error message")).not.toThrow();
  });

  test("logger.debug is optional and callable when present", () => {
    if (
      typeof (logger as { debug?: (message: string) => void }).debug ===
      "function"
    ) {
      expect(() => logger.debug("debug message")).not.toThrow();
    }
  });

  test("logger.info with context does not throw", () => {
    expect(() =>
      logger.info("with context", { email: "user@example.com", userId: 1 }),
    ).not.toThrow();
  });

  test("logger.error with Error context does not throw", () => {
    expect(() =>
      logger.error("failed", { error: new Error("boom") }),
    ).not.toThrow();
  });

  test("logger handles nested objects", () => {
    expect(() =>
      logger.info("test", {
        nested: { deep: { value: 123 } },
      } as any),
    ).not.toThrow();
  });

  test("logger handles arrays in context", () => {
    expect(() =>
      logger.info("test", { items: [1, 2, 3] } as any),
    ).not.toThrow();
  });

  test("logger handles Date in context", () => {
    expect(() =>
      logger.info("test", { date: new Date() } as any),
    ).not.toThrow();
  });

  test("logger truncates deeply nested objects", () => {
    // depth > 6 should be truncated
    let deepObj: any = { val: "bottom" };
    for (let i = 0; i < 10; i++) {
      deepObj = { nested: deepObj };
    }
    expect(() => logger.info("deep", deepObj)).not.toThrow();
  });

  test("logger handles email without @ sign", () => {
    expect(() =>
      logger.error("test", { email: "invalid-email" }),
    ).not.toThrow();
  });
});

// ─── errors.ts ────────────────────────────────────────────────────────────────

describe("errors", () => {
  test("toErrorMessage returns message from Error", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  test("toErrorMessage converts string to string", () => {
    expect(toErrorMessage("string error")).toBe("string error");
  });

  test("toErrorMessage converts number to string", () => {
    expect(toErrorMessage(42)).toBe("42");
  });

  test("toError returns Error instance from Error", () => {
    const err = new Error("test");
    expect(toError(err)).toBe(err);
  });

  test("toError wraps non-Error in Error", () => {
    const result = toError("string");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("string");
  });
});

// ─── url – getUrlHostnameDisplayLabel ────────────────────────────────────────

describe("url – getUrlHostnameDisplayLabel", () => {
  test("returns hostname without www", async () => {
    expect(getUrlHostnameDisplayLabel("https://www.example.com")).toBe(
      "example.com",
    );
  });

  test("preserves www when stripWww is disabled", async () => {
    expect(
      getUrlHostnameDisplayLabel("https://www.example.com", {
        stripWww: false,
      }),
    ).toBe("www.example.com");
  });

  test("returns raw input for invalid URL", async () => {
    expect(getUrlHostnameDisplayLabel("not-a-url")).toBe("not-a-url");
  });

  test("returns default for undefined", async () => {
    expect(getUrlHostnameDisplayLabel(undefined)).toBe("No source URL");
  });
});

// ─── date-utils.ts ────────────────────────────────────────────────────────────

describe("date-utils – formatRelativeDate", () => {
  test("today returns 'Today' prefix", async () => {
    const result = formatRelativeDate(new Date());
    expect(result).toMatch(/^Today /);
  });

  test("yesterday returns 'Yesterday' prefix", async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const result = formatRelativeDate(yesterday);
    expect(result).toMatch(/^Yesterday /);
  });

  test("3 days ago returns days ago format", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    const result = formatRelativeDate(threeDaysAgo);
    expect(result).toBe("3 days ago");
  });

  test("6 days ago returns days ago format", async () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000);
    expect(formatRelativeDate(sixDaysAgo)).toBe("6 days ago");
  });

  test("7+ days ago returns locale date", async () => {
    const oldDate = new Date(Date.now() - 10 * 86_400_000);
    const result = formatRelativeDate(oldDate);
    // Should be a locale date string, not "X days ago"
    expect(result).not.toMatch(/days ago/);
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
