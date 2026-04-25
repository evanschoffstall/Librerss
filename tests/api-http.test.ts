import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  ApiError,
  BATCH_REQUEST_TIMEOUT_MS,
  createApiClient,
  createLinkedAbortController,
  resolveBatchRequestTimeoutMs,
  withRequestDeadline,
} from "@/lib/api/http/client";
import {
  buildApiFailureDiagnostics,
  isVerboseLoggingEnabled,
  toBodySnippet,
} from "@/lib/api/http/diagnostics";
import {
  asTrimmedString,
  getSearchParams,
  parseFormOrQueryParams,
  parseJsonBody,
  parseJsonObjectBodyOrResponse,
  parseNonNegativeInt,
  parsePositiveInt,
} from "@/lib/api/http/request";
import {
  ensureArrayResponse,
  forbiddenResponse,
  jsonError,
  jsonErrorWithReason,
  normalizeBatchItem,
} from "@/lib/api/http/responses";
import {
  clientFeedBatchConcurrency,
  clientFeedBatchMaxUrls,
  clientFeedRequestTimeoutMs,
} from "@/lib/config";
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

  test("scales batch timeout by request waves", () => {
    const urlCount = 35;
    const expectedWaveCount = Math.ceil(
      urlCount / Math.max(1, clientFeedBatchConcurrency()),
    );

    expect(resolveBatchRequestTimeoutMs(urlCount)).toBe(
      expectedWaveCount * clientFeedRequestTimeoutMs() + 5_000,
    );
  });

  test("exports the max batch timeout as the upper bound for allowed batches", () => {
    expect(BATCH_REQUEST_TIMEOUT_MS).toBe(
      resolveBatchRequestTimeoutMs(clientFeedBatchMaxUrls()),
    );
  });
});

describe("api/http-client – createApiClient", () => {
  test("parses JSON and text responses through the fetch adapter", async () => {
    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/json")) {
          expect(init?.method).toBe("GET");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
            statusText: "OK",
          });
        }

        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ name: "LibreRSS" }));

        return new Response("created", {
          headers: { "content-type": "text/plain; charset=utf-8" },
          status: 201,
          statusText: "Created",
        });
      },
    );
    const client = createApiClient(fetchMock as unknown as typeof fetch);

    await expect(
      client.get<{ ok: boolean }>("https://example.com/json"),
    ).resolves.toEqual({
      data: { ok: true },
      headers: { "content-type": "application/json" },
      status: 200,
      statusText: "OK",
    });

    await expect(
      client.post<string>("https://example.com/text", { name: "LibreRSS" }),
    ).resolves.toEqual({
      data: "created",
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 201,
      statusText: "Created",
    });
  });

  test("supports blob responses and 204 empty bodies", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/blob")) {
        return new Response(new Blob(["hello"]), {
          headers: { "content-type": "application/octet-stream" },
          status: 200,
          statusText: "OK",
        });
      }

      return new Response(null, {
        status: 204,
        statusText: "No Content",
      });
    });
    const client = createApiClient(fetchMock as unknown as typeof fetch);

    const blobResponse = await client.get<Blob>("https://example.com/blob", {
      responseType: "blob",
    });
    expect(await blobResponse.data.text()).toBe("hello");

    const emptyResponse = await client.delete("https://example.com/empty");
    expect(emptyResponse.data).toBeUndefined();
    expect(emptyResponse.status).toBe(204);
  });

  test("throws ApiError for transport and non-ok responses", async () => {
    const failingTransportClient = createApiClient(
      mock(async () => {
        throw new DOMException("aborted", "AbortError");
      }) as unknown as typeof fetch,
    );

    await expect(
      failingTransportClient.get("https://example.com/abort"),
    ).rejects.toMatchObject({
      code: "ABORT_ERR",
      isApiError: true,
      method: "GET",
      response: undefined,
      url: "https://example.com/abort",
    });

    const failingResponseClient = createApiClient(
      mock(
        async () =>
          new Response(JSON.stringify({ error: "blocked" }), {
            headers: { "content-type": "application/json" },
            status: 429,
            statusText: "Too Many Requests",
          }),
      ) as unknown as typeof fetch,
    );

    await expect(
      failingResponseClient.get("https://example.com/rate-limit"),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

// ── api/http/diagnostics – isVerboseLoggingEnabled + toBodySnippet ───────────

describe("api/http/diagnostics – isVerboseLoggingEnabled", () => {
  test("returns false via CONFIG when LOG_LEVEL env var is unset", async () => {
    const prev = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    try {
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
    const obj = { toString: () => "Custom object representation" };
    const result = toBodySnippet(obj);
    expect(result).toContain("Custom object representation");
  });

  test("truncates long toString output", async () => {
    const long = "x".repeat(500);
    const obj = { toString: () => long };
    const result = toBodySnippet(obj, 100);
    expect(result).toContain("…");
    expect(result!.length).toBeLessThan(200);
  });

  test("returns undefined when toString yields [object Object]", async () => {
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
    formData.set(
      "avatar",
      new Blob(["binary"], { type: "text/plain" }),
      "avatar.txt",
    );

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

  test("buildApiFailureDiagnostics keeps only safe request and response fields", () => {
    const diagnostics = buildApiFailureDiagnostics(
      new ApiError(
        "Request failed with status code 503",
        "ECONNRESET",
        "get",
        {
          Accept: "application/xml",
          Authorization: "secret",
          "User-Agent": "LibreRSS",
        } as Record<string, string>,
        {
          data: "   temporary upstream failure   ",
          headers: {
            "Retry-After": "120",
            Server: "cloudflare",
            "Set-Cookie": "session=secret",
          },
          status: 503,
          statusText: "Service Unavailable",
        },
        "https://example.com/feed.xml",
      ),
    );

    expect(diagnostics).toEqual({
      requestErrorCode: "ECONNRESET",
      requestHeaders: {
        accept: "application/xml",
        "user-agent": "LibreRSS",
      },
      requestMaxRedirects: null,
      requestTimeoutMs: null,
      responseBodySnippet: "temporary upstream failure",
      responseHeaders: {
        "retry-after": "120",
        server: "cloudflare",
      },
      upstreamMethod: "GET",
      upstreamStatus: 503,
      upstreamStatusText: "Service Unavailable",
      upstreamUrl: "https://example.com/feed.xml",
    });
  });

  test("buildApiFailureDiagnostics returns an empty object for non-api errors", () => {
    expect(buildApiFailureDiagnostics(new Error("boom"))).toEqual({});
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

  test("ensureArrayResponse returns arrays and rejects non-arrays", () => {
    expect(ensureArrayResponse([1, 2, 3])).toEqual([1, 2, 3]);
    expect(() => ensureArrayResponse({ items: [] })).toThrow(
      "Invalid response format",
    );
  });

  test("jsonErrorWithReason includes reason only when provided", async () => {
    const withReason = jsonErrorWithReason("Blocked", 429, "rate-limited");
    expect(await withReason.json()).toEqual({
      error: "Blocked",
      reason: "rate-limited",
    });

    const withoutReason = jsonErrorWithReason("Blocked", 429);
    expect(await withoutReason.json()).toEqual({ error: "Blocked" });
  });

  test("normalizeBatchItem normalizes partial and invalid payloads", () => {
    const normalized = normalizeBatchItem({
      articles: [{ id: 1 }],
      error: "timeout",
      lastFetchedAt: "2024-02-03T04:05:06.000Z",
      ok: 1,
      unchanged: true,
      url: "https://example.com/feed.xml",
    });

    expect(normalized).toMatchObject({
      articles: [{ id: 1 }],
      error: "timeout",
      ok: true,
      unchanged: true,
      url: "https://example.com/feed.xml",
    });
    expect(normalized.lastFetchedAt).toBeInstanceOf(Date);

    expect(normalizeBatchItem(null)).toEqual({
      articles: [],
      ok: false,
      url: "",
    });
  });
});
