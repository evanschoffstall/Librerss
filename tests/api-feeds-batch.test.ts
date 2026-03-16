import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

import type { BatchRouteDeps } from "@/app/api/feeds/batch/route";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
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
});
