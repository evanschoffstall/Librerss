import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

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
  parseNonNegativeInt,
  parsePositiveInt,
  toBodySnippet,
  withRequestDeadline,
} from "@/lib/api/http";
import { parseDateOrNull } from "@/lib/utils/dates";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

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

// ── lib/api/http/request – parseJsonBodyOrResponse invalid JSON (line 75) ─────

describe("lib/api/http/request – parseJsonBodyOrResponse returns Response on bad JSON", () => {
  test("returns Response when body is not valid JSON (line 75)", async () => {
    const { parseJsonBodyOrResponse } = await import("@/lib/api/http/request");
    const req = new Request("https://dummy.local/api/endpoint", {
      body: "not-valid-json!!!",
      headers: { "content-type": "application/json" },
      method: "POST",
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

  test("parsePositiveInt and parseNonNegativeInt reject unsafe integers", () => {
    expect(parsePositiveInt(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
    expect(parseNonNegativeInt(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
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
      body: JSON.stringify({ name: "test" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await parseJsonBody(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).name).toBe("test");
    }
  });

  test("rejects empty body as invalid JSON", async () => {
    const request = new Request("https://example.com/api", {
      body: "",
      method: "POST",
    });
    const result = await parseJsonBody(request);
    expect(result.ok).toBe(false);
  });

  test("rejects body exceeding content-length limit", async () => {
    const request = new Request("https://example.com/api", {
      body: "{}",
      headers: { "content-length": "999999999" },
      method: "POST",
    });
    const result = await parseJsonBody(request, { maxBytes: 1024 });
    expect(result.ok).toBe(false);
  });

  test("rejects invalid JSON", async () => {
    const request = new Request("https://example.com/api", {
      body: "not json at all {{{",
      method: "POST",
    });
    const result = await parseJsonBody(request);
    expect(result.ok).toBe(false);
  });

  test("parseJsonObjectBodyOrResponse rejects null payload", async () => {
    const request = new Request("https://example.com/api", {
      body: "null",
      headers: { "content-type": "application/json" },
      method: "POST",
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
      body: JSON.stringify([1, 2, 3]),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await parseJsonObjectBodyOrResponse(request);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });

  test("parseJsonObjectBodyOrResponse accepts object payload", async () => {
    const request = new Request("https://example.com/api", {
      body: JSON.stringify({ name: "ok" }),
      headers: { "content-type": "application/json" },
      method: "POST",
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
      body: "username=test&password=secret",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const result = await parseFormOrQueryParams(request);
    expect(result).toBeInstanceOf(URLSearchParams);
    expect((result as URLSearchParams).get("username")).toBe("test");
  });

  test("rejects oversized POST body via content-length", async () => {
    const request = new Request("https://example.com/api", {
      body: "x=y",
      headers: {
        "content-length": "999999999",
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    const result = await parseFormOrQueryParams(request, { maxBytes: 1024 });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });

  test("parses multipart form data and ignores non-string values", async () => {
    const formData = new FormData();
    formData.set("username", "test-user");
    formData.set("avatar", new Blob(["binary"], { type: "text/plain" }), "avatar.txt");

    const request = new Request("https://example.com/api", {
      body: formData,
      method: "POST",
    });

    const result = await parseFormOrQueryParams(request, { maxBytes: 1024 });

    expect(result).toBeInstanceOf(URLSearchParams);
    expect((result as URLSearchParams).get("username")).toBe("test-user");
    expect((result as URLSearchParams).has("avatar")).toBe(false);
  });

  test("rejects multipart form data that exceeds the byte limit", async () => {
    const formData = new FormData();
    formData.set("username", "x".repeat(64));

    const request = new Request("https://example.com/api", {
      body: formData,
      method: "POST",
    });

    const result = await parseFormOrQueryParams(request, { maxBytes: 8 });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });

  test("returns 400 when multipart parsing throws", async () => {
    const request = new Request("https://example.com/api", {
      headers: { "content-type": "multipart/form-data; boundary=test" },
      method: "POST",
    });

    Object.defineProperty(request, "formData", {
      configurable: true,
      value: async () => {
        throw new Error("malformed body");
      },
    });

    const result = await parseFormOrQueryParams(request, { maxBytes: 1024 });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
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
          headers: {
            Accept: ["application/xml", "text/xml"],
            Authorization: "secret",
            "User-Agent": "LibreRSS",
          },
          maxRedirects: 3,
          method: "get",
          timeout: 2000,
          url: "https://example.com/feed.xml",
        },
        response: {
          data: "   temporary upstream failure   ",
          headers: {
            "Retry-After": 120,
            Server: "cloudflare",
            "Set-Cookie": "session=secret",
          },
          status: 503,
          statusText: "Service Unavailable",
        },
      },
      alwaysAxiosError,
    );

    expect(diagnostics).toMatchObject({
      axiosErrorCode: "ECONNRESET",
      requestMaxRedirects: 3,
      requestTimeoutMs: 2000,
      responseBodySnippet: "temporary upstream failure",
      upstreamMethod: "GET",
      upstreamStatus: 503,
      upstreamStatusText: "Service Unavailable",
      upstreamUrl: "https://example.com/feed.xml",
    });
    expect(diagnostics.requestHeaders).toEqual({
      accept: "application/xml, text/xml",
      "user-agent": "LibreRSS",
    });
    expect(diagnostics.responseHeaders).toEqual({
      "retry-after": "120",
      server: "cloudflare",
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
