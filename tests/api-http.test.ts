import {
  asTrimmedString,
  buildAxiosFailureDiagnostics,
  createLinkedAbortController,
  forbiddenResponse,
  getSearchParams,
  isVerboseLoggingEnabled,
  jsonError,
  parseFormOrQueryParams,
  parseJsonBody,
  parseJsonObjectBodyOrResponse,
  parsePositiveInt,
  toBodySnippet,
  withRequestDeadline,
} from "@/lib/api/http";
import { parseDateOrNull } from "@/lib/utils/dates";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("lib/api/reader-api", () => {
  test("parseReaderStreamItems extracts items array from response", async () => {
    const { parseReaderStreamItems } = await import("@/lib/api/http");

    const response = {
      items: [
        { id: "item1", title: "Test Article" },
        { id: "item2", title: "Another Article" },
      ],
    };

    const result = parseReaderStreamItems(response);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Test Article");
  });

  test("parseReaderStreamItems returns empty array for undefined response", async () => {
    const { parseReaderStreamItems } = await import("@/lib/api/http");

    const result = parseReaderStreamItems(undefined);
    expect(result).toEqual([]);
  });

  test("parseReaderStreamItems returns empty array when items is not array", async () => {
    const { parseReaderStreamItems } = await import("@/lib/api/http");

    const result = parseReaderStreamItems({ items: "not-an-array" } as any);
    expect(result).toEqual([]);
  });

  test("readerItemToArticle converts reader item to article format", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      id: "tag:google.com,2005:reader/item/abc123",
      title: "Test Article",
      published: 1640000000,
      canonical: [{ href: "https://example.com/article" }],
      summary: { content: "<p>Article content here</p>" },
      origin: {
        streamId: "feed/https://example.com/feed.xml",
        title: "Example Feed",
        htmlUrl: "https://example.com",
      },
      categories: ["user/-/state/com.google/read"],
    };

    const result = readerItemToArticle(item, 0);

    expect(result.title).toBe("Test Article");
    expect(result.link).toBe("https://example.com/article");
    expect(result.content).toBe("<p>Article content here</p>");
    expect(result.feedName).toBe("Example Feed");
    expect(result.feedUrl).toBe("https://example.com");
    expect(result.isRead).toBe(true);
    expect(result.isStarred).toBe(false);
  });

  test("readerItemToArticle uses alternate link when canonical is missing", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      alternate: [{ href: "https://example.com/alt" }],
    };

    const result = readerItemToArticle(item, 5);
    expect(result.link).toBe("https://example.com/alt");
  });

  test("readerItemToArticle uses fallback link when both canonical and alternate missing", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {};

    const result = readerItemToArticle(item, 10);
    expect(result.link).toBe("about:reader-item-10");
  });

  test("readerItemToArticle uses updated timestamp when published is missing", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      updated: 1650000000,
    };

    const result = readerItemToArticle(item, 0);
    expect(result.publicationDate.getTime()).toBe(1650000000000);
  });

  test("readerItemToArticle detects starred state from categories", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      categories: ["user/-/state/com.google/starred"],
    };

    const result = readerItemToArticle(item, 0);
    expect(result.isStarred).toBe(true);
    expect(result.isRead).toBe(false);
  });

  test("readerItemToArticle extracts feed URL from streamId", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      origin: {
        streamId: "feed/https://blog.example.com/rss",
      },
    };

    const result = readerItemToArticle(item, 0);
    expect(result.feedUrl).toBe("https://blog.example.com/rss");
  });

  test("readerItemToArticle handles missing origin gracefully", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      title: "No Origin",
    };

    const result = readerItemToArticle(item, 0);
    expect(result.feedName).toBeUndefined();
    expect(result.feedUrl).toBeUndefined();
  });

  test("readerItemToArticle sanitizes tiny placeholder images from summary content", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      title: "Placeholder",
      canonical: [{ href: "https://example.com/article" }],
      summary: {
        content:
          '<img style="display:block" src="https://static.files.bbci.co.uk/grey-placeholder.png" width="150" height="84" /><p>Body remains</p>',
      },
    };

    const result = readerItemToArticle(item, 0);
    expect(result.content).not.toContain("grey-placeholder.png");
    expect(result.content).toContain("Body remains");
  });
});

// ── api/http-client – createLinkedAbortController ───────────────────────────

describe("api/http-client – createLinkedAbortController", () => {
  test("immediately aborts when signal already aborted", () => {
    const abortedController = new AbortController();
    abortedController.abort();

    const { controller, dispose } = createLinkedAbortController(
      abortedController.signal,
    );
    expect(controller.signal.aborted).toBe(true);
    dispose();
  });

  test("aborts when parent signal fires", () => {
    const parent = new AbortController();
    const { controller, dispose } = createLinkedAbortController(parent.signal);

    expect(controller.signal.aborted).toBe(false);
    parent.abort();
    expect(controller.signal.aborted).toBe(true);
    dispose();
  });

  test("no signal returns no-op dispose", () => {
    const { controller, dispose } = createLinkedAbortController();
    expect(controller.signal.aborted).toBe(false);
    expect(() => dispose()).not.toThrow();
  });
});

// ── api/http-client – withRequestDeadline ───────────────────────────────────

describe("api/http-client – withRequestDeadline", () => {
  test("resolves when promise resolves before timeout", async () => {
    const result = await withRequestDeadline(Promise.resolve("ok"), 5000);
    expect(result).toBe("ok");
  });

  test("rejects with timeout error on slow request", async () => {
    const neverResolves = new Promise<string>(() => {});
    await expect(withRequestDeadline(neverResolves, 1)).rejects.toThrow(
      "Request timeout",
    );
  });

  test("calls onTimeout callback when timing out", async () => {
    let called = false;
    const neverResolves = new Promise<string>(() => {});
    await expect(
      withRequestDeadline(neverResolves, 1, () => {
        called = true;
      }),
    ).rejects.toThrow();
    expect(called).toBe(true);
  });
});

// ── api/http/diagnostics – isVerboseLoggingEnabled + toBodySnippet ───────────

describe("api/http/diagnostics – isVerboseLoggingEnabled", () => {
  test("returns false via CONFIG when LOG_LEVEL env var is unset", async () => {
    const prev = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    try {
      const { isVerboseLoggingEnabled } =
        await import("@/lib/api/http/diagnostics");
      // CONFIG.LOG_LEVEL throws when env var is missing → catch returns false
      const result = isVerboseLoggingEnabled();
      expect(result).toBe(false);
    } finally {
      if (prev !== undefined) process.env.LOG_LEVEL = prev;
    }
  });
});

describe("api/http/diagnostics – toBodySnippet", () => {
  test("converts object with custom toString to string", async () => {
    const { toBodySnippet } = await import("@/lib/api/http/diagnostics");
    const obj = { toString: () => "Custom object representation" };
    const result = toBodySnippet(obj);
    expect(result).toContain("Custom object representation");
  });

  test("truncates long toString output", async () => {
    const { toBodySnippet } = await import("@/lib/api/http/diagnostics");
    const long = "x".repeat(500);
    const obj = { toString: () => long };
    const result = toBodySnippet(obj, 100);
    expect(result).toContain("…");
    expect(result!.length).toBeLessThan(200);
  });

  test("returns undefined when toString yields [object Object]", async () => {
    const { toBodySnippet } = await import("@/lib/api/http/diagnostics");
    const obj = {}; // .toString() returns "[object Object]"
    expect(toBodySnippet(obj)).toBeUndefined();
  });
});

// ── lib/api/http/reader-mappers – parseReaderStreamItems / readerItemToArticle

describe("lib/api/http/reader-mappers – parseReaderStreamItems", () => {
  test("returns empty array for undefined input", async () => {
    const { parseReaderStreamItems } =
      await import("@/lib/api/http/reader-mappers");
    expect(parseReaderStreamItems(undefined)).toEqual([]);
  });

  test("returns items array when present", async () => {
    const { parseReaderStreamItems } =
      await import("@/lib/api/http/reader-mappers");
    const items = [{ id: "item1" }, { id: "item2" }];
    expect(parseReaderStreamItems({ items })).toEqual(items);
  });
});

describe("lib/api/http/reader-mappers – readerItemToArticle", () => {
  test("maps reader item to article with canonical link and read/starred state", async () => {
    const { readerItemToArticle } =
      await import("@/lib/api/http/reader-mappers");
    const { READ_STATE, STARRED_STATE } = await import("@/lib/core/stream-ids");
    const item = {
      id: "tag:google.com,2005:reader/item/1a2b",
      title: "Test Article",
      canonical: [{ href: "https://example.com/article" }],
      published: Math.floor(Date.now() / 1000) - 3600,
      summary: { content: "<p>content</p>" },
      origin: { title: "Example Blog", htmlUrl: "https://example.com" },
      categories: [READ_STATE, STARRED_STATE],
    };
    const article = readerItemToArticle(item, 0);
    expect(article.title).toBe("Test Article");
    expect(article.link).toBe("https://example.com/article");
    expect(article.isRead).toBe(true);
    expect(article.isStarred).toBe(true);
  });

  test("generates fallback link and id when none provided", async () => {
    const { readerItemToArticle } =
      await import("@/lib/api/http/reader-mappers");
    const article = readerItemToArticle({ title: "No Link" }, 5);
    expect(article.link).toBe("about:reader-item-5");
    expect(article.id).toBe(6);
  });

  test("resolves updated timestamp when published is absent", async () => {
    const { readerItemToArticle } =
      await import("@/lib/api/http/reader-mappers");
    const ts = Math.floor(Date.now() / 1000) - 7200;
    const article = readerItemToArticle(
      { title: "Updated Only", updated: ts },
      0,
    );
    expect(article.publicationDate.getTime()).toBeCloseTo(ts * 1000, -2);
  });
});

// ── lib/api/http/request – parseJsonBodyOrResponse invalid JSON (line 75) ─────

describe("lib/api/http/request – parseJsonBodyOrResponse returns Response on bad JSON", () => {
  test("returns Response when body is not valid JSON (line 75)", async () => {
    const { parseJsonBodyOrResponse } = await import("@/lib/api/http/request");
    const req = new Request("https://dummy.local/api/endpoint", {
      method: "POST",
      body: "not-valid-json!!!",
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonBodyOrResponse(req);
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
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

  test("parseDateOrNull returns Date for valid date string", () => {
    const result = parseDateOrNull("2024-01-15T12:00:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(new Date("2024-01-15T12:00:00Z").getTime());
  });

  test("parseDateOrNull returns null for invalid date", () => {
    expect(parseDateOrNull("not-a-date")).toBeNull();
  });

  test("parseDateOrNull returns null for non-string input", () => {
    expect(parseDateOrNull(42)).toBeNull();
    expect(parseDateOrNull(null)).toBeNull();
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

describe("http diagnostics", () => {
  test("toBodySnippet compacts and truncates strings", () => {
    const snippet = toBodySnippet("  hello\n\nworld  ", 5);
    expect(snippet).toBe("hello…");
  });

  test("toBodySnippet ignores plain object toString output", () => {
    expect(toBodySnippet({})).toBeUndefined();
  });

  test("buildAxiosFailureDiagnostics returns empty object for non-axios errors", () => {
    expect(buildAxiosFailureDiagnostics(new Error("boom"))).toEqual({});
  });

  test("buildAxiosFailureDiagnostics keeps only safe headers and metadata", () => {
    const alwaysAxiosError: typeof import("axios").isAxiosError = <
      T = unknown,
      D = unknown,
    >(
      _payload: unknown,
    ): _payload is import("axios").AxiosError<T, D> => true;

    const diagnostics = buildAxiosFailureDiagnostics(
      {
        code: "ECONNRESET",
        config: {
          method: "get",
          url: "https://example.com/feed.xml",
          timeout: 2000,
          maxRedirects: 3,
          headers: {
            "User-Agent": "LibreRSS",
            Authorization: "secret",
            Accept: ["application/xml", "text/xml"],
          },
        },
        response: {
          status: 503,
          statusText: "Service Unavailable",
          headers: {
            Server: "cloudflare",
            "Retry-After": 120,
            "Set-Cookie": "session=secret",
          },
          data: "   temporary upstream failure   ",
        },
      },
      alwaysAxiosError,
    );

    expect(diagnostics).toMatchObject({
      upstreamStatus: 503,
      upstreamStatusText: "Service Unavailable",
      upstreamMethod: "GET",
      upstreamUrl: "https://example.com/feed.xml",
      requestTimeoutMs: 2000,
      requestMaxRedirects: 3,
      axiosErrorCode: "ECONNRESET",
      responseBodySnippet: "temporary upstream failure",
    });
    expect(diagnostics.requestHeaders).toEqual({
      "user-agent": "LibreRSS",
      accept: "application/xml, text/xml",
    });
    expect(diagnostics.responseHeaders).toEqual({
      server: "cloudflare",
      "retry-after": "120",
    });
  });

  test("isVerboseLoggingEnabled checks LOG_LEVEL environment", () => {
    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "verbose";
    try {
      expect(isVerboseLoggingEnabled()).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previous;
      }
    }
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
