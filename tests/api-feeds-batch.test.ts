import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

import type { BatchRouteDeps } from "@/app/api/feeds/batch/route";

import { CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";
import { serverApi } from "@/lib/server";

const originalLoggerInfo = logger.info;
const originalLoggerWarn = logger.warn;
const originalLoggerError = logger.error;

beforeEach(() => {
  mock.restore();
  logger.info = (() => {}) as typeof logger.info;
  logger.warn = (() => {}) as typeof logger.warn;
  logger.error = (() => {}) as typeof logger.error;
});

afterEach(() => {
  mock.restore();
  logger.info = originalLoggerInfo;
  logger.warn = originalLoggerWarn;
  logger.error = originalLoggerError;
});

describe("api/feeds/batch route", () => {
  type FetchAndCacheFeedArticlesBatchFn = NonNullable<
    BatchRouteDeps["fetchAndCacheFeedArticlesBatchFn"]
  >;
  type FetchAndCacheFeedArticlesBatchResult = Awaited<
    ReturnType<FetchAndCacheFeedArticlesBatchFn>
  >;

  const user = {
    email: "test@example.com",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    sessionId: 1,
    userId: 42,
  };

  function createRouteDeps(options?: {
    batchResult?: FetchAndCacheFeedArticlesBatchResult;
  }): {
    deps: BatchRouteDeps;
    fetchAndCacheFeedArticlesBatch: ReturnType<typeof mock>;
  } {
    const defaultBatchResult: FetchAndCacheFeedArticlesBatchResult = {
      articles: new Map(),
      cachedCount: 0,
      cooldownLimitedCount: 0,
      errors: new Map(),
      lastFetchedByUrl: new Map(),
      refreshedCount: 0,
      resolution: "upstream",
      unchangedUrls: new Set(),
    };
    const fetchAndCacheFeedArticlesBatch = mock(
      async (
        _db: Parameters<FetchAndCacheFeedArticlesBatchFn>[0],
        _userId: Parameters<FetchAndCacheFeedArticlesBatchFn>[1],
        _feedUrls: Parameters<FetchAndCacheFeedArticlesBatchFn>[2],
        _options?: Parameters<FetchAndCacheFeedArticlesBatchFn>[3],
      ): Promise<FetchAndCacheFeedArticlesBatchResult> =>
        options?.batchResult ?? defaultBatchResult,
    );

    return {
      deps: {
        fetchAndCacheFeedArticlesBatchFn:
          fetchAndCacheFeedArticlesBatch as FetchAndCacheFeedArticlesBatchFn,
        getDbFn: () => ({ mocked: true }) as never,
        logAndRespondErrorFn: (_message: string, _error: unknown) =>
          new Response(JSON.stringify({ error: "internal" }), { status: 500 }),
        requireMutableAuthenticatedUserFn: async () => user,
      },
      fetchAndCacheFeedArticlesBatch,
    };
  }

  test("returns explicit errors for invalid URLs instead of silently dropping them", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps } = createRouteDeps();

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({ urls: ["not-a-url", "still bad"] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    expect(response.status).toBe(207);

    const data = await response.json();
    expect(data).toEqual([
      {
        articles: [],
        error: "Invalid feed URL",
        ok: false,
        url: "not-a-url",
      },
      {
        articles: [],
        error: "Invalid feed URL",
        ok: false,
        url: "still bad",
      },
    ]);
  });

  test("deduplicates semantically identical normalized URLs before batch fetch", async () => {
    const normalizedUrl = "https://example.com/feed";
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps({
      batchResult: {
        articles: new Map([[normalizedUrl, []]]),
        cachedCount: 1,
        cooldownLimitedCount: 0,
        errors: new Map(),
        lastFetchedByUrl: new Map(),
        refreshedCount: 0,
        resolution: "memory",
        unchangedUrls: new Set(),
      },
    });
    const { POST } = await import("@/app/api/feeds/batch/route");

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        urls: [
          "https://example.com/feed/",
          "https://example.com/feed",
          "https://example.com/feed#fragment",
        ],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    expect(response.status).toBe(200);

    expect(fetchAndCacheFeedArticlesBatch).toHaveBeenCalledTimes(1);
    expect(fetchAndCacheFeedArticlesBatch.mock.calls[0]?.[2]).toEqual([
      normalizedUrl,
    ]);

    const data = await response.json();
    expect(data).toEqual([
      {
        articles: [],
        ok: true,
        url: normalizedUrl,
      },
    ]);
  });

  test("returns unchanged markers when the client already has the current feed payload", async () => {
    const normalizedUrl = "https://example.com/feed";
    const timestamp = new Date("2026-03-14T12:00:00.000Z");
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps } = createRouteDeps({
      batchResult: {
        articles: new Map(),
        cachedCount: 1,
        cooldownLimitedCount: 0,
        errors: new Map(),
        lastFetchedByUrl: new Map([[normalizedUrl, timestamp]]),
        refreshedCount: 0,
        resolution: "memory",
        unchangedUrls: new Set([normalizedUrl]),
      },
    });

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        knownLastFetchedAtByUrl: {
          [normalizedUrl]: timestamp.toISOString(),
        },
        urls: [normalizedUrl],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual([
      {
        articles: [],
        lastFetchedAt: timestamp.toISOString(),
        ok: true,
        unchanged: true,
        url: normalizedUrl,
      },
    ]);
  });

  test("returns upstream status codes alongside per-feed upstream errors", async () => {
    const normalizedUrl = "https://example.com/feed";
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps } = createRouteDeps({
      batchResult: {
        articles: new Map(),
        cachedCount: 0,
        cooldownLimitedCount: 0,
        errors: new Map([
          [
            normalizedUrl,
            { message: "Upstream responded with status 504", statusCode: 504 },
          ],
        ]),
        lastFetchedByUrl: new Map(),
        refreshedCount: 1,
        resolution: "upstream",
        unchangedUrls: new Set(),
      },
    });

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({ urls: [normalizedUrl] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    expect(response.status).toBe(207);

    const data = await response.json();
    expect(data).toEqual([
      {
        articles: [],
        error: "Upstream responded with status 504",
        ok: false,
        statusCode: 504,
        url: normalizedUrl,
      },
    ]);
  });

  test("returns an empty array for an empty batch request without calling the fetcher", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({ urls: [] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
  });

  test("logs diagnostics for an empty request when refresh diagnostics are enabled", async () => {
    const previousDiagnostics = process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED;
    const previousLogLevel = process.env.LOG_LEVEL;
    const originalInfo = logger.info;
    const info = mock(() => undefined);

    process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED = "true";
    process.env.LOG_LEVEL = "info";
    logger.info = info;

    try {
      const { POST } = await import("@/app/api/feeds/batch/route");
      const { deps } = createRouteDeps();
      const request = new NextRequest("http://localhost/api/feeds/batch", {
        body: JSON.stringify({ requestSource: "dashboard", urls: [] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const response = await POST(request, deps);

      expect(response.status).toBe(200);
      expect(info).toHaveBeenNthCalledWith(1, "Feed batch request received", {
        articleFilter: "all",
        articleLimit: undefined,
        articleSortOrder: "newest",
        forceRefresh: false,
        requestedUrlCount: 0,
        requestSource: "dashboard",
        searchTerm: undefined,
        skipRefresh: false,
        userId: user.userId,
      });
      expect(info).toHaveBeenNthCalledWith(
        2,
        "Batch [0 feeds]: client=auto | empty request",
      );
    } finally {
      logger.info = originalInfo;
      if (previousDiagnostics === undefined) {
        delete process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED;
      } else {
        process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED = previousDiagnostics;
      }
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  test("rejects requests that exceed the configured feed limit", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();

    const urls = Array.from(
      { length: CONFIG.FEED_BATCH_MAX_URLS + 1 },
      (_, index) => `https://example.com/feed-${index}`,
    );
    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({ urls }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: `A maximum of ${CONFIG.FEED_BATCH_MAX_URLS} feed URLs can be loaded at once`,
    });
    expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
  });

  test("rejects non-object knownLastFetchedAtByUrl payloads before calling the fetcher", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        knownLastFetchedAtByUrl: ["2026-01-01T00:00:00.000Z"],
        urls: ["https://example.com/feed"],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error:
        "knownLastFetchedAtByUrl must be an object mapping URLs to ISO dates",
    });
    expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
  });

  test("rejects invalid knownLastFetchedAtByUrl date values", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        knownLastFetchedAtByUrl: {
          "https://example.com/feed": "not-a-date",
        },
        urls: ["https://example.com/feed"],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "knownLastFetchedAtByUrl values must be valid ISO date strings",
    });
    expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
  });

  test("keeps direct isolated fallback results when proxy credentials are unreadable", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps } = createRouteDeps();
    const directUrl = "https://example.com/feed";
    const proxiedUrl = "https://example.com/other-feed";
    const lastFetchedAt = new Date("2026-05-03T18:00:00.000Z");
    const resolveProxyTransportAttempts = mock(async () => {
      throw new serverApi.ServerServiceError(
        "Saved proxy password could not be read. Update it in settings and try again.",
        500,
        "proxy-password-unreadable",
      );
    });

    deps.fetchAndCacheFeedArticlesBatchFn = mock(
      async (_db, _userId, feedUrls, options) => {
        if (feedUrls.length > 1) {
          throw new Error("batch refresh aborted by unreadable proxy settings");
        }

        if (feedUrls[0] === proxiedUrl) {
          await options?.resolveProxyTransport?.();
        }

        return {
          articles: new Map([
            [directUrl, [{ id: 1, title: "Direct article" } as never]],
          ]),
          cachedCount: 0,
          cooldownLimitedCount: 0,
          errors: new Map(),
          lastFetchedByUrl: new Map([[directUrl, lastFetchedAt]]),
          refreshedCount: 1,
          resolution: "upstream",
          unchangedUrls: new Set(),
        };
      },
    ) as BatchRouteDeps["fetchAndCacheFeedArticlesBatchFn"];
    deps.resolveUserProxyFn = resolveProxyTransportAttempts as never;

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        urls: [directUrl, proxiedUrl],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(207);
    expect(data).toEqual([
      {
        articles: [{ id: 1, title: "Direct article" }],
        lastFetchedAt: lastFetchedAt.toISOString(),
        ok: true,
        url: directUrl,
      },
      {
        articles: [],
        error:
          "Saved proxy password could not be read. Update it in settings and try again.",
        ok: false,
        url: proxiedUrl,
      },
    ]);
    expect(deps.fetchAndCacheFeedArticlesBatchFn).toHaveBeenCalledTimes(3);
    expect(resolveProxyTransportAttempts).toHaveBeenCalledTimes(1);
  });

  test("returns 207 for mixed invalid URLs and upstream errors", async () => {
    const validUrl = "https://example.com/feed";
    const timestamp = new Date("2026-03-20T12:00:00.000Z");
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps({
      batchResult: {
        articles: new Map([[validUrl, [{ id: 1, title: "Article" } as never]]]),
        cachedCount: 0,
        cooldownLimitedCount: 0,
        errors: new Map([[validUrl, { message: "Upstream timed out" }]]),
        lastFetchedByUrl: new Map([[validUrl, timestamp]]),
        refreshedCount: 1,
        resolution: "upstream",
        unchangedUrls: new Set(),
      },
    });

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({ urls: ["not-a-url", validUrl] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(207);
    expect(fetchAndCacheFeedArticlesBatch).toHaveBeenCalledTimes(1);
    expect(data).toEqual([
      {
        articles: [],
        error: "Invalid feed URL",
        ok: false,
        url: "not-a-url",
      },
      {
        articles: [{ id: 1, title: "Article" }],
        error: "Upstream timed out",
        lastFetchedAt: timestamp.toISOString(),
        ok: true,
        url: validUrl,
      },
    ]);
  });

  test("logs diagnostics when all URLs are invalid after normalization", async () => {
    const previousDiagnostics = process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED;
    const previousLogLevel = process.env.LOG_LEVEL;
    const originalInfo = logger.info;
    const info = mock(() => undefined);

    process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED = "true";
    process.env.LOG_LEVEL = "info";
    logger.info = info;

    try {
      const { POST } = await import("@/app/api/feeds/batch/route");
      const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();
      const request = new NextRequest("http://localhost/api/feeds/batch", {
        body: JSON.stringify({ urls: ["bad-url", "also-bad"] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const response = await POST(request, deps);

      expect(response.status).toBe(207);
      expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
      expect(info).toHaveBeenNthCalledWith(1, "Feed batch request received", {
        articleFilter: "all",
        articleLimit: undefined,
        articleSortOrder: "newest",
        forceRefresh: false,
        requestedUrlCount: 2,
        requestSource: "unspecified",
        searchTerm: undefined,
        skipRefresh: false,
        userId: user.userId,
      });
      expect(info).toHaveBeenNthCalledWith(
        2,
        "Feed batch request had no valid URLs after normalization",
        { invalidUrlCount: 2, userId: user.userId },
      );
    } finally {
      logger.info = originalInfo;
      if (previousDiagnostics === undefined) {
        delete process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED;
      } else {
        process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED = previousDiagnostics;
      }
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  test("logs completion diagnostics and forwards parsed timestamps to the batch fetcher", async () => {
    const previousDiagnostics = process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED;
    const previousLogLevel = process.env.LOG_LEVEL;
    const originalInfo = logger.info;
    const info = mock(() => undefined);

    process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED = "true";
    process.env.LOG_LEVEL = "info";
    logger.info = info;

    try {
      const normalizedUrl = "https://example.com/feed";
      const knownLastFetchedAt = "2026-03-21T10:00:00.000Z";
      const refreshedAt = new Date("2026-03-21T10:05:00.000Z");
      const { POST } = await import("@/app/api/feeds/batch/route");
      const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps({
        batchResult: {
          articles: new Map([
            [normalizedUrl, [{ id: 7, title: "Covered" } as never]],
          ]),
          cachedCount: 0,
          cooldownLimitedCount: 1,
          errors: new Map(),
          lastFetchedByUrl: new Map([[normalizedUrl, refreshedAt]]),
          refreshedCount: 1,
          resolution: "upstream",
          unchangedUrls: new Set(),
        },
      });

      const request = new NextRequest("http://localhost/api/feeds/batch", {
        body: JSON.stringify({
          forceRefresh: true,
          knownLastFetchedAtByUrl: { [normalizedUrl]: knownLastFetchedAt },
          requestSource: "coverage-test",
          urls: [normalizedUrl],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const response = await POST(request, deps);

      expect(response.status).toBe(200);
      expect(fetchAndCacheFeedArticlesBatch).toHaveBeenCalledTimes(1);
      expect(fetchAndCacheFeedArticlesBatch.mock.calls[0]?.[3]).toEqual({
        articleFilter: "all",
        articleLimit: undefined,
        articleSortOrder: "newest",
        forceRefresh: true,
        knownLastFetchedAtByUrl: new Map([
          [normalizedUrl, new Date(knownLastFetchedAt)],
        ]),
        requestSource: "coverage-test",
        resolveProxyTransport: expect.any(Function),
        searchTerm: undefined,
        skipRefresh: false,
      });
      expect(info).toHaveBeenNthCalledWith(1, "Feed batch request received", {
        articleFilter: "all",
        articleLimit: undefined,
        articleSortOrder: "newest",
        forceRefresh: true,
        requestedUrlCount: 1,
        requestSource: "coverage-test",
        searchTerm: undefined,
        skipRefresh: false,
        userId: user.userId,
      });
      expect(info).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^Batch \[1 feed\]: client=force resolved=upstream \| 1 refreshed, 0 cached, all throttled in \d+ms$/,
        ),
      );
      expect(info).toHaveBeenNthCalledWith(3, "Feed batch request completed", {
        articleFilter: "all",
        articleLimit: undefined,
        articleSortOrder: "newest",
        forceRefresh: true,
        invalidUrlCount: 0,
        missingCount: 0,
        normalizedUrlCount: 1,
        okCount: 1,
        requestSource: "coverage-test",
        searchTerm: undefined,
        skipRefresh: false,
        totalArticles: 1,
        upstreamErrorCount: 0,
        userId: user.userId,
      });
    } finally {
      logger.info = originalInfo;
      if (previousDiagnostics === undefined) {
        delete process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED;
      } else {
        process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED = previousDiagnostics;
      }
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  test("forwards forceResolveUpstream and logs the dev-force client intent", async () => {
    const previousDiagnostics = process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED;
    const previousLogLevel = process.env.LOG_LEVEL;
    const originalInfo = logger.info;
    const info = mock(() => undefined);

    process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED = "true";
    process.env.LOG_LEVEL = "info";
    logger.info = info;

    try {
      const normalizedUrl = "https://example.com/feed";
      const refreshedAt = new Date("2026-03-21T10:05:00.000Z");
      const { POST } = await import("@/app/api/feeds/batch/route");
      const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps({
        batchResult: {
          articles: new Map([[normalizedUrl, []]]),
          cachedCount: 0,
          cooldownLimitedCount: 0,
          errors: new Map(),
          lastFetchedByUrl: new Map([[normalizedUrl, refreshedAt]]),
          refreshedCount: 1,
          resolution: "upstream",
          unchangedUrls: new Set(),
        },
      });

      const request = new NextRequest("http://localhost/api/feeds/batch", {
        body: JSON.stringify({
          forceResolveUpstream: true,
          requestSource: "coverage-test",
          urls: [normalizedUrl],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const response = await POST(request, deps);

      expect(response.status).toBe(200);
      expect(fetchAndCacheFeedArticlesBatch).toHaveBeenCalledTimes(1);
      expect(fetchAndCacheFeedArticlesBatch.mock.calls[0]?.[3]).toEqual({
        articleFilter: "all",
        articleLimit: undefined,
        articleSortOrder: "newest",
        forceRefresh: false,
        forceResolveUpstream: true,
        knownLastFetchedAtByUrl: new Map(),
        requestSource: "coverage-test",
        resolveProxyTransport: expect.any(Function),
        searchTerm: undefined,
        skipRefresh: false,
      });
      expect(info).toHaveBeenNthCalledWith(1, "Feed batch request received", {
        articleFilter: "all",
        articleLimit: undefined,
        articleSortOrder: "newest",
        forceRefresh: true,
        forceResolveUpstream: true,
        requestedUrlCount: 1,
        requestSource: "coverage-test",
        searchTerm: undefined,
        skipRefresh: false,
        userId: user.userId,
      });
      expect(info).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^Batch \[1 feed\]: client=dev-force resolved=upstream \| 1 refreshed, 0 cached in \d+ms$/,
        ),
      );
      expect(info).toHaveBeenNthCalledWith(3, "Feed batch request completed", {
        articleFilter: "all",
        articleLimit: undefined,
        articleSortOrder: "newest",
        forceRefresh: true,
        forceResolveUpstream: true,
        invalidUrlCount: 0,
        missingCount: 0,
        normalizedUrlCount: 1,
        okCount: 1,
        requestSource: "coverage-test",
        searchTerm: undefined,
        skipRefresh: false,
        totalArticles: 0,
        upstreamErrorCount: 0,
        userId: user.userId,
      });
    } finally {
      logger.info = originalInfo;
      if (previousDiagnostics === undefined) {
        delete process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED;
      } else {
        process.env.FEED_REFRESH_DIAGNOSTICS_ENABLED = previousDiagnostics;
      }
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  test("rejects invalid articleFilter payloads before calling the batch fetcher", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        articleFilter: "broken",
        urls: ["https://example.com/feed"],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "articleFilter must be one of all, unread, read, or starred",
    });
    expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
  });

  test("rejects non-boolean forceResolveUpstream payloads before calling the batch fetcher", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        forceResolveUpstream: "yes",
        urls: ["https://example.com/feed"],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "forceResolveUpstream must be a boolean",
    });
    expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
  });

  test("forwards articleFilter to the batch fetcher", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        articleFilter: "unread",
        urls: ["https://example.com/feed"],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);

    expect(response.status).toBe(200);
    expect(fetchAndCacheFeedArticlesBatch).toHaveBeenCalledTimes(1);
    expect(fetchAndCacheFeedArticlesBatch.mock.calls[0]?.[3]).toEqual({
      articleFilter: "unread",
      articleLimit: undefined,
      articleSortOrder: "newest",
      forceRefresh: false,
      knownLastFetchedAtByUrl: new Map(),
      requestSource: "unspecified",
      resolveProxyTransport: expect.any(Function),
      searchTerm: undefined,
      skipRefresh: false,
    });
  });

  test("forwards explicit large article windows without clamping them to the fallback limit", async () => {
    const normalizedUrl = "https://example.com/feed";
    const requestedLargeWindow = CONFIG.MAX_ALL_ARTICLES_LIMIT + 9_500;
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps({
      batchResult: {
        articles: new Map([[normalizedUrl, []]]),
        cachedCount: 0,
        cooldownLimitedCount: 0,
        errors: new Map(),
        lastFetchedByUrl: new Map(),
        refreshedCount: 0,
        resolution: "cache",
        unchangedUrls: new Set(),
      },
    });
    const { POST } = await import("@/app/api/feeds/batch/route");

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        articleFilter: "unread",
        articleLimit: requestedLargeWindow,
        urls: [normalizedUrl],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    expect(response.status).toBe(200);
    expect(fetchAndCacheFeedArticlesBatch).toHaveBeenCalledTimes(1);
    expect(fetchAndCacheFeedArticlesBatch.mock.calls[0]?.[3]).toMatchObject({
      articleFilter: "unread",
      articleLimit: requestedLargeWindow,
    });
  });

  test("rejects unsafe article windows before they can reach the ranked SQL limit", async () => {
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();
    const { POST } = await import("@/app/api/feeds/batch/route");

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        articleLimit: Number.MAX_SAFE_INTEGER + 1,
        urls: ["https://example.com/feed"],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "articleLimit must be a positive safe integer when provided",
    });
    expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
  });

  test("rejects fractional article windows instead of truncating pagination intent", async () => {
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();
    const { POST } = await import("@/app/api/feeds/batch/route");

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        articleLimit: 500.5,
        urls: ["https://example.com/feed"],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "articleLimit must be a positive safe integer when provided",
    });
    expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
  });

  test("trims and forwards searchTerm to the batch fetcher", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        searchTerm: "  mars rover  ",
        urls: ["https://example.com/feed"],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);

    expect(response.status).toBe(200);
    expect(fetchAndCacheFeedArticlesBatch).toHaveBeenCalledTimes(1);
    expect(fetchAndCacheFeedArticlesBatch.mock.calls[0]?.[3]).toEqual({
      articleFilter: "all",
      articleLimit: undefined,
      articleSortOrder: "newest",
      forceRefresh: false,
      knownLastFetchedAtByUrl: new Map(),
      requestSource: "unspecified",
      resolveProxyTransport: expect.any(Function),
      searchTerm: "mars rover",
      skipRefresh: false,
    });
  });

  test("rejects non-string searchTerm values", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { deps, fetchAndCacheFeedArticlesBatch } = createRouteDeps();

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        searchTerm: 123,
        urls: ["https://example.com/feed"],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "searchTerm must be a string when provided",
    });
    expect(fetchAndCacheFeedArticlesBatch).not.toHaveBeenCalled();
  });

  test("uses the error responder when the batch fetch throws", async () => {
    const { POST } = await import("@/app/api/feeds/batch/route");
    const logAndRespondErrorFn = mock(
      () =>
        new Response(JSON.stringify({ error: "internal" }), { status: 500 }),
    );
    const deps: BatchRouteDeps = {
      fetchAndCacheFeedArticlesBatchFn: mock(async () => {
        throw new Error("boom");
      }) as never,
      getDbFn: () => ({ mocked: true }) as never,
      logAndRespondErrorFn,
      requireMutableAuthenticatedUserFn: async () => user,
    };

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({ urls: ["https://example.com/feed"] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: "internal" });
    expect(logAndRespondErrorFn).toHaveBeenCalledWith(
      "Feed batch fetch error",
      expect.any(Error),
    );
  });

  test("falls back to isolated feed batches when a multi-feed refresh throws", async () => {
    const firstUrl = "https://example.com/feed-one";
    const secondUrl = "https://example.com/feed-two";
    const lastFetchedAt = new Date("2026-05-03T12:00:00.000Z");
    const { POST } = await import("@/app/api/feeds/batch/route");
    const warn = mock(() => undefined);
    const fetchAndCacheFeedArticlesBatch = mock(
      async (
        _db: Parameters<FetchAndCacheFeedArticlesBatchFn>[0],
        _userId: Parameters<FetchAndCacheFeedArticlesBatchFn>[1],
        feedUrls: Parameters<FetchAndCacheFeedArticlesBatchFn>[2],
        _options?: Parameters<FetchAndCacheFeedArticlesBatchFn>[3],
      ): Promise<FetchAndCacheFeedArticlesBatchResult> => {
        if (feedUrls.length > 1) {
          throw new Error("batch refresh aborted");
        }

        const [feedUrl] = feedUrls;
        if (feedUrl === secondUrl) {
          throw new Error("isolated upstream failure");
        }

        return {
          articles: new Map([
            [firstUrl, [{ id: 1, title: "Recovered article" } as never]],
          ]),
          cachedCount: 0,
          cooldownLimitedCount: 0,
          errors: new Map(),
          lastFetchedByUrl: new Map([[firstUrl, lastFetchedAt]]),
          refreshedCount: 1,
          resolution: "upstream",
          unchangedUrls: new Set(),
        };
      },
    );
    logger.warn = warn as typeof logger.warn;
    const deps: BatchRouteDeps = {
      fetchAndCacheFeedArticlesBatchFn:
        fetchAndCacheFeedArticlesBatch as FetchAndCacheFeedArticlesBatchFn,
      getDbFn: () => ({ mocked: true }) as never,
      logAndRespondErrorFn: (_message: string, _error: unknown) =>
        new Response(JSON.stringify({ error: "internal" }), { status: 500 }),
      requireMutableAuthenticatedUserFn: async () => user,
    };

    const request = new NextRequest("http://localhost/api/feeds/batch", {
      body: JSON.stringify({
        forceRefresh: true,
        requestSource: "manual-refresh",
        urls: [firstUrl, secondUrl],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await POST(request, deps);
    const data = await response.json();

    expect(response.status).toBe(207);
    expect(fetchAndCacheFeedArticlesBatch).toHaveBeenCalledTimes(3);
    expect(fetchAndCacheFeedArticlesBatch.mock.calls[0]?.[2]).toEqual([
      firstUrl,
      secondUrl,
    ]);
    expect(fetchAndCacheFeedArticlesBatch.mock.calls[1]?.[2]).toEqual([
      firstUrl,
    ]);
    expect(fetchAndCacheFeedArticlesBatch.mock.calls[2]?.[2]).toEqual([
      secondUrl,
    ]);
    expect(data).toEqual([
      {
        articles: [{ id: 1, title: "Recovered article" }],
        lastFetchedAt: lastFetchedAt.toISOString(),
        ok: true,
        url: firstUrl,
      },
      {
        articles: [],
        error: "isolated upstream failure",
        ok: false,
        url: secondUrl,
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      "Feed batch fetch fell back to isolated feed requests",
      {
        failedFeedCount: 1,
        originalError: "batch refresh aborted",
        succeededFeedCount: 1,
        userId: user.userId,
      },
    );
  });

  test("returns fast per-feed fallback budget errors once the serverless request window is spent", async () => {
    const previousServerlessLimits = process.env.FEED_SERVERLESS_LIMITS_ENABLED;
    const firstUrl = "https://example.com/feed-one";
    const secondUrl = "https://example.com/feed-two";
    const startedCalls: string[][] = [];
    const nowValues = [1_000, 1_000, 3_501, 3_501];
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { ISOLATED_FEED_BATCH_FALLBACK_BUDGET_EXHAUSTED_MESSAGE } =
      await import("@/lib/server");
    const fetchAndCacheFeedArticlesBatch = mock(
      async (
        _db: Parameters<FetchAndCacheFeedArticlesBatchFn>[0],
        _userId: Parameters<FetchAndCacheFeedArticlesBatchFn>[1],
        feedUrls: Parameters<FetchAndCacheFeedArticlesBatchFn>[2],
        _options?: Parameters<FetchAndCacheFeedArticlesBatchFn>[3],
      ): Promise<FetchAndCacheFeedArticlesBatchResult> => {
        startedCalls.push([...feedUrls]);
        throw new Error("batch refresh aborted after platform budget");
      },
    );
    const deps: BatchRouteDeps = {
      fetchAndCacheFeedArticlesBatchFn:
        fetchAndCacheFeedArticlesBatch as FetchAndCacheFeedArticlesBatchFn,
      getDbFn: () => ({ mocked: true }) as never,
      logAndRespondErrorFn: (_message: string, _error: unknown) =>
        new Response(JSON.stringify({ error: "internal" }), { status: 500 }),
      nowFn: () => nowValues.shift() ?? 3_501,
      requireMutableAuthenticatedUserFn: async () => user,
    };

    process.env.FEED_SERVERLESS_LIMITS_ENABLED = "true";

    try {
      const request = new NextRequest("http://localhost/api/feeds/batch", {
        body: JSON.stringify({
          forceRefresh: true,
          requestSource: "manual-refresh",
          urls: [firstUrl, secondUrl],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const response = await POST(request, deps);
      const data = await response.json();

      expect(response.status).toBe(207);
      expect(startedCalls).toEqual([[firstUrl, secondUrl]]);
      expect(data).toEqual([
        {
          articles: [],
          error: ISOLATED_FEED_BATCH_FALLBACK_BUDGET_EXHAUSTED_MESSAGE,
          ok: false,
          url: firstUrl,
        },
        {
          articles: [],
          error: ISOLATED_FEED_BATCH_FALLBACK_BUDGET_EXHAUSTED_MESSAGE,
          ok: false,
          url: secondUrl,
        },
      ]);
    } finally {
      if (previousServerlessLimits === undefined) {
        delete process.env.FEED_SERVERLESS_LIMITS_ENABLED;
      } else {
        process.env.FEED_SERVERLESS_LIMITS_ENABLED = previousServerlessLimits;
      }
    }
  });

  test("returns per-feed errors when the serverless route response budget expires before the batch completes", async () => {
    const previousServerlessLimits = process.env.FEED_SERVERLESS_LIMITS_ENABLED;
    const firstUrl = "https://example.com/feed-one";
    const secondUrl = "https://example.com/feed-two";
    const timeoutToken = setTimeout(() => undefined, 0);
    clearTimeout(timeoutToken);
    const scheduledTimeouts: number[] = [];
    const clearedTimeouts: unknown[] = [];
    const { POST } = await import("@/app/api/feeds/batch/route");
    const { BATCH_ROUTE_BUDGET_EXHAUSTED_MESSAGE } =
      await import("@/lib/server");
    const fetchAndCacheFeedArticlesBatch = mock(
      (): Promise<FetchAndCacheFeedArticlesBatchResult> =>
        new Promise<FetchAndCacheFeedArticlesBatchResult>(() => undefined),
    );
    const deps: BatchRouteDeps = {
      clearTimeoutFn: ((timeoutId) => {
        clearedTimeouts.push(timeoutId);
      }) as typeof clearTimeout,
      fetchAndCacheFeedArticlesBatchFn:
        fetchAndCacheFeedArticlesBatch as FetchAndCacheFeedArticlesBatchFn,
      getDbFn: () => ({ mocked: true }) as never,
      logAndRespondErrorFn: (_message: string, _error: unknown) =>
        new Response(JSON.stringify({ error: "internal" }), { status: 500 }),
      nowFn: () => 1_000,
      requireMutableAuthenticatedUserFn: async () => user,
      setTimeoutFn: ((
        handler: Parameters<typeof setTimeout>[0],
        timeout?: Parameters<typeof setTimeout>[1],
      ) => {
        scheduledTimeouts.push(timeout ?? 0);
        queueMicrotask(() => {
          if (typeof handler === "function") {
            handler();
          }
        });
        return timeoutToken;
      }) as typeof setTimeout,
    };

    process.env.FEED_SERVERLESS_LIMITS_ENABLED = "true";

    try {
      const request = new NextRequest("http://localhost/api/feeds/batch", {
        body: JSON.stringify({
          forceRefresh: true,
          requestSource: "manual-refresh",
          urls: [firstUrl, "not-a-url", secondUrl],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const response = await POST(request, deps);
      const data = await response.json();

      expect(response.status).toBe(207);
      expect(fetchAndCacheFeedArticlesBatch).toHaveBeenCalledTimes(1);
      expect(scheduledTimeouts).toEqual([8_500]);
      expect(clearedTimeouts).toEqual([timeoutToken]);
      expect(data).toEqual([
        {
          articles: [],
          error: BATCH_ROUTE_BUDGET_EXHAUSTED_MESSAGE,
          ok: false,
          url: firstUrl,
        },
        {
          articles: [],
          error: "Invalid feed URL",
          ok: false,
          url: "not-a-url",
        },
        {
          articles: [],
          error: BATCH_ROUTE_BUDGET_EXHAUSTED_MESSAGE,
          ok: false,
          url: secondUrl,
        },
      ]);
    } finally {
      if (previousServerlessLimits === undefined) {
        delete process.env.FEED_SERVERLESS_LIMITS_ENABLED;
      } else {
        process.env.FEED_SERVERLESS_LIMITS_ENABLED = previousServerlessLimits;
      }
    }
  });
});
