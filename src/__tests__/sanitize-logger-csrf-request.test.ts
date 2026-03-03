/**
 * Pure-function tests for sanitize, logger, CSRF, request parsing, and errors.
 * All tested via real imports — no module mocking.
 */

import {
  asTrimmedString,
  forbiddenResponse,
  getSearchParams,
  jsonError,
  parseDateInput,
  parseFormOrQueryParams,
  parseJsonBody,
  parseJsonObjectBodyOrResponse,
  parsePositiveInt
} from "@/lib/api/http";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleHtml,
  sanitizeArticleTitle,
  stripOrphanedRelatedBlocks,
  toPlainText,
} from "@/lib/sanitize";
import { toError, toErrorMessage } from "@/lib/utils/errors";
import { describe, expect, test } from "bun:test";

// ─── sanitize.ts ──────────────────────────────────────────────────────────────

describe("sanitize – toPlainText", () => {
  test("strips HTML tags", () => {
    expect(toPlainText("<p>Hello <b>World</b></p>")).toBe("Hello World");
  });

  test("converts br tags to newlines", () => {
    expect(toPlainText("Line1<br>Line2")).toBe("Line1\nLine2");
  });

  test("converts self-closing br tags", () => {
    expect(toPlainText("A<br/>B<br />C")).toBe("A\nB\nC");
  });

  test("replaces &nbsp; with space", () => {
    expect(toPlainText("Hello&nbsp;World")).toBe("Hello World");
  });

  test("replaces &#160; with space", () => {
    expect(toPlainText("Hello&#160;World")).toBe("Hello World");
  });

  test("replaces &amp; with &", () => {
    expect(toPlainText("A &amp; B")).toBe("A & B");
  });

  test("collapses excessive blank lines", () => {
    const manyBlanks = "Hello\n\n\n\n\n\n\n\nWorld";
    const result = toPlainText(manyBlanks);
    const maxNewlines = result.split("").filter((c) => c === "\n").length;
    expect(maxNewlines).toBeLessThanOrEqual(4);
  });

  test("trims result", () => {
    expect(toPlainText("  <p>  text  </p>  ")).toBe("text");
  });

  test("converts closing block tags to newlines", () => {
    expect(toPlainText("<div>A</div><div>B</div>")).toContain("A\nB");
  });

  test("normalizes CRLF to LF", () => {
    expect(toPlainText("A\r\nB")).toBe("A\nB");
  });

  test("collapses multiple spaces", () => {
    expect(toPlainText("A    B")).toBe("A B");
  });

  test("removes embedded media fallback placeholder text", () => {
    const html =
      '<p>Before</p><iframe src="https://www.youtube.com/embed/abc">YouTube Video</iframe><p>After</p>';
    const result = toPlainText(html);
    expect(result).toContain("Before");
    expect(result).toContain("After");
    expect(result).not.toContain("YouTube Video");
  });
});

describe("sanitize – sanitizeArticleHtml", () => {
  test("returns empty for whitespace-only input", () => {
    expect(sanitizeArticleHtml("   ")).toBe("");
  });

  test("strips script tags", () => {
    const result = sanitizeArticleHtml("<p>Hello</p><script>alert(1)</script>");
    expect(result).not.toContain("script");
    expect(result).toContain("Hello");
  });

  test("preserves allowed tags", () => {
    const result = sanitizeArticleHtml("<p>Test <strong>bold</strong></p>");
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
  });

  test("adds rel and target to links", () => {
    const result = sanitizeArticleHtml(
      '<a href="https://example.com">Link</a>',
    );
    expect(result).toContain('rel="noopener noreferrer nofollow"');
    expect(result).toContain('target="_blank"');
  });

  test("strips aside/nav/section tags and content", () => {
    const result = sanitizeArticleHtml(
      "<p>Main</p><aside>Sidebar content</aside>",
    );
    expect(result).toContain("Main");
    expect(result).not.toContain("Sidebar content");
  });

  test("strips iframe fallback placeholder text", () => {
    const result = sanitizeArticleHtml(
      '<p>Main</p><iframe src="https://www.youtube.com/embed/abc">YouTube Video</iframe><p>After</p>',
    );
    expect(result).toContain("Main");
    expect(result).toContain("After");
    expect(result).not.toContain("YouTube Video");
    expect(result).not.toContain("<iframe");
  });

  test("strips AP junk blocks with hub-peek class", () => {
    const html =
      '<p>Article</p><div class="hub-peek"><h2>Related</h2><ul><li>Link</li></ul></div>';
    const result = sanitizeArticleHtml(html);
    expect(result).toContain("Article");
    expect(result).not.toContain("hub-peek");
  });

  test("strips related-stories class blocks", () => {
    const html =
      '<div class="related-stories"><h2>Related</h2></div><p>Keep</p>';
    const result = sanitizeArticleHtml(html);
    expect(result).toContain("Keep");
  });

  test("enforces lazy loading on images", () => {
    const result = sanitizeArticleHtml(
      '<img src="https://example.com/img.jpg" width="800" height="600">',
    );
    expect(result).toContain('loading="lazy"');
  });

  test("enforces no-referrer on images", () => {
    const result = sanitizeArticleHtml(
      '<img src="https://example.com/img.jpg" width="800" height="600">',
    );
    expect(result).toContain('referrerpolicy="no-referrer"');
  });

  test("preserves img allowed attributes", () => {
    const result = sanitizeArticleHtml(
      '<img src="https://example.com/img.jpg" alt="Test" width="200" height="120">',
    );
    expect(result).toContain('alt="Test"');
    expect(result).toContain('width="200"');
    expect(result).toContain('height="120"');
  });
});

describe("sanitize – sanitizeArticleTitle", () => {
  test("strips all HTML from title", () => {
    expect(sanitizeArticleTitle("<b>Breaking</b> News")).toBe("Breaking News");
  });

  test("returns Untitled for null", () => {
    expect(sanitizeArticleTitle(null)).toBe("Untitled");
  });

  test("returns Untitled for undefined", () => {
    expect(sanitizeArticleTitle(undefined)).toBe("Untitled");
  });

  test("returns Untitled for empty string", () => {
    expect(sanitizeArticleTitle("")).toBe("Untitled");
  });

  test("returns Untitled for whitespace-only", () => {
    expect(sanitizeArticleTitle("   ")).toBe("Untitled");
  });

  test("truncates overlong titles", () => {
    const long = "A".repeat(600);
    const result = sanitizeArticleTitle(long);
    // Result must stay within MAX_ARTICLE_TITLE_LENGTH (500) — the ellipsis
    // suffix is included in the budget, not added on top.
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result).toEndWith("\u2026");
  });

  test("strips script tags from title", () => {
    expect(sanitizeArticleTitle("<script>alert(1)</script>Title")).toBe(
      "Title",
    );
  });
});

describe("sanitize – sanitizeAndTruncateArticleContent", () => {
  test("returns sanitized content under limit unchanged", () => {
    const result = sanitizeAndTruncateArticleContent("<p>Short content</p>");
    expect(result).toContain("Short content");
  });

  test("truncates overlong content with sentinel", () => {
    const longContent = "<p>" + "X".repeat(110_000) + "</p>";
    const result = sanitizeAndTruncateArticleContent(longContent);
    expect(result).toContain("[content truncated]");
    expect(result.length).toBeLessThan(longContent.length);
  });
});

describe("sanitize – stripOrphanedRelatedBlocks", () => {
  test("removes orphaned 'More on' heading with list", () => {
    const html =
      '<h2>More on this topic</h2><ul><li><a href="#">Link</a></li></ul>';
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("More on");
  });

  test("removes orphaned 'Related' heading", () => {
    const html = "<h3>Related Stories</h3><ul><li>Item</li></ul><p>Keep</p>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("Related");
    expect(result).toContain("Keep");
  });

  test("keeps non-related headings", () => {
    const html = "<h2>Introduction</h2><p>Content here</p>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).toContain("Introduction");
  });

  test("removes stray related heading without list", () => {
    const html = "<p>Main text</p><h2>See Also</h2>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("See Also");
    expect(result).toContain("Main text");
  });

  test("removes 'You may also like' heading", () => {
    const html = "<h3>You may also like</h3><ol><li>Other</li></ol>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("You may also like");
  });

  test("removes 'Trending Now' heading", () => {
    const html = "<h2>Trending Now</h2><ul><li>Hot</li></ul>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("Trending Now");
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
      logger.info("with context", { userId: 1, email: "user@example.com" }),
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

// ─── csrf.ts ──────────────────────────────────────────────────────────────────

describe("csrf – requireSameOrigin", () => {
  test("allows GET requests", () => {
    const request = new Request("https://example.com/api/test", {
      method: "GET",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("allows HEAD requests", () => {
    const request = new Request("https://example.com/api/test", {
      method: "HEAD",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("allows OPTIONS requests", () => {
    const request = new Request("https://example.com/api/test", {
      method: "OPTIONS",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("allows POST with same-origin header", () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("rejects POST with cross-origin", () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "https://evil.com",
        "sec-fetch-site": "cross-site",
      },
    });
    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test("rejects POST with no origin, no referer, no sec-fetch-site", () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { host: "example.com" },
    });
    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test("allows POST with same-site sec-fetch-site and no origin/referer", () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("allows POST with referer from same origin", () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        referer: "https://example.com/dashboard",
      },
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("rejects POST with referer from different origin", () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        referer: "https://evil.com/page",
      },
    });
    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test("rejects DELETE with sec-fetch-site cross-site", () => {
    const request = new Request("https://example.com/api/test", {
      method: "DELETE",
      headers: {
        host: "example.com",
        "sec-fetch-site": "cross-site",
      },
    });
    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});

// ─── request.ts ───────────────────────────────────────────────────────────────

describe("request – parsing helpers", () => {
  test("asTrimmedString trims strings", () => {
    expect(asTrimmedString("  hello  ")).toBe("hello");
  });

  test("asTrimmedString returns empty for non-string", () => {
    expect(asTrimmedString(42)).toBe("");
    expect(asTrimmedString(null)).toBe("");
    expect(asTrimmedString(undefined)).toBe("");
  });

  test("parsePositiveInt returns number for positive int string", () => {
    expect(parsePositiveInt("42")).toBe(42);
    expect(parsePositiveInt("1")).toBe(1);
  });

  test("parsePositiveInt returns null for non-positive", () => {
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("-5")).toBeNull();
    expect(parsePositiveInt("abc")).toBeNull();
    expect(parsePositiveInt(null)).toBeNull();
  });

  test("parsePositiveInt returns null for float strings", () => {
    expect(parsePositiveInt("3.5")).toBeNull();
  });

  test("parseDateInput returns Date for valid date string", () => {
    const result = parseDateInput("2024-01-15T12:00:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(new Date("2024-01-15T12:00:00Z").getTime());
  });

  test("parseDateInput returns null for invalid date", () => {
    expect(parseDateInput("not-a-date")).toBeNull();
  });

  test("parseDateInput returns null for non-string input", () => {
    expect(parseDateInput(42)).toBeNull();
    expect(parseDateInput(null)).toBeNull();
  });

  test("getSearchParams extracts params from URL", () => {
    const request = new Request("https://example.com/api?foo=bar&n=10");
    const params = getSearchParams(request);
    expect(params.get("foo")).toBe("bar");
    expect(params.get("n")).toBe("10");
  });
});

describe("request – parseJsonBody", () => {
  test("parses valid JSON body", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonBody(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).name).toBe("test");
    }
  });

  test("rejects empty body as invalid JSON", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: "",
    });
    const result = await parseJsonBody(request);
    expect(result.ok).toBe(false);
  });

  test("rejects body exceeding content-length limit", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "999999999" },
    });
    const result = await parseJsonBody(request, { maxBytes: 1024 });
    expect(result.ok).toBe(false);
  });

  test("rejects invalid JSON", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: "not json at all {{{",
    });
    const result = await parseJsonBody(request);
    expect(result.ok).toBe(false);
  });

  test("parseJsonObjectBodyOrResponse rejects null payload", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: "null",
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonObjectBodyOrResponse(request);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
      await expect(result.json()).resolves.toEqual({
        error: "JSON body must be an object",
      });
    }
  });

  test("parseJsonObjectBodyOrResponse rejects array payload", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonObjectBodyOrResponse(request);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });

  test("parseJsonObjectBodyOrResponse accepts object payload", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: JSON.stringify({ name: "ok" }),
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonObjectBodyOrResponse(request);
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.name).toBe("ok");
    }
  });
});

describe("request – parseFormOrQueryParams", () => {
  test("returns search params for GET requests", async () => {
    const request = new Request("https://example.com/api?key=value", {
      method: "GET",
    });
    const result = await parseFormOrQueryParams(request);
    expect(result).toBeInstanceOf(URLSearchParams);
    expect((result as URLSearchParams).get("key")).toBe("value");
  });

  test("parses URL-encoded POST body", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: "username=test&password=secret",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const result = await parseFormOrQueryParams(request);
    expect(result).toBeInstanceOf(URLSearchParams);
    expect((result as URLSearchParams).get("username")).toBe("test");
  });

  test("rejects oversized POST body via content-length", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: "x=y",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": "999999999",
      },
    });
    const result = await parseFormOrQueryParams(request, { maxBytes: 1024 });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });
});

// ─── responses.ts ─────────────────────────────────────────────────────────────

describe("responses", () => {
  test("jsonError returns correct status", () => {
    const resp = jsonError("Not found", 404);
    expect(resp.status).toBe(404);
  });

  test("jsonError response body contains error", async () => {
    const resp = jsonError("Bad request", 400);
    const body = await resp.json();
    expect(body.error).toBe("Bad request");
  });

  test("forbiddenResponse returns 403", () => {
    const resp = forbiddenResponse();
    expect(resp.status).toBe(403);
  });

  test("forbiddenResponse with custom message", async () => {
    const resp = forbiddenResponse("Access denied");
    const body = await resp.json();
    expect(body.error).toBe("Access denied");
  });
});
