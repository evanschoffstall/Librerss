/**
 * Comprehensive Tests: Feed Fetcher Module
 * Tests for src/lib/core/feed-fetcher.ts
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { FeedRecord } from "@/lib/core/feed-refresh";
import type { getDb } from "@/lib/db/db";

import {
  fetchAndCacheFeedArticles,
  fetchAndCacheFeedArticlesBatch,
  isFeedSourceNotFoundError,
  isUpstreamFeedError,
  resetFeedFetcherDependenciesForTesting,
  setFeedFetcherDependenciesForTesting,
} from "@/lib/core/feed-fetcher";
import {
  isAllowedFeedUrl,
  PUBLIC_FEED_URL_ERROR,
} from "@/lib/core/feed-url-validator";

// Mock dependencies
const mockDb = {
  insert: mock(() => ({
    into: mock(() => ({
      values: mock(() => ({
        onConflictDoNothing: mock(() => ({
          returning: mock(() => Promise.resolve([])),
        })),
      })),
    })),
  })),
  select: mock(() => ({
    from: mock(() => ({
      leftJoin: mock(() => ({
        where: mock(() => ({
          orderBy: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      })),
      where: mock(() => ({
        limit: mock(() => Promise.resolve([])),
        orderBy: mock(() => ({
          limit: mock(() => Promise.resolve([])),
        })),
      })),
    })),
  })),
  transaction: mock(async (callback: any) => {
    return callback(mockDb);
  }),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([{ id: 1 }])),
      })),
    })),
  })),
} as unknown as ReturnType<typeof getDb>;

function createFeedRecord(overrides: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: 1,
    lastFetched: new Date(Date.now() - 1000 * 60 * 60),
    lastFetchError: null,
    url: "https://example.com/feed",
    ...overrides,
  };
}

function registerModuleMocks() {
  setFeedFetcherDependenciesForTesting({
    diagInfo: mock(() => {}),
    diagWarn: mock(() => {}),
    ensureFeedRecordByUrl: mock(async () => createFeedRecord()),
    executeParallelRefreshes: mock(async () => ({
      cooldownLimitedCount: 0,
      errors: new Map<string, string>(),
      refreshedCount: 1,
      refreshedUrls: new Set<string>(["https://example.com/feed"]),
    })),
    getCachedBatch: mock(() => null),
    invalidateUserCache: mock(() => {}),
    mapRowsToArticleMap: mock(() => new Map()),
    queryTopArticlesPerFeed: mock(async () => []),
    refreshFeedFromUpstream: mock(async () => ({ ok: true as const })),
    resolveAuthorizedFeedRecords: mock(async () => ({
      allowedUrls: ["https://example.com/feed"],
      feedByUrl: new Map([["https://example.com/feed", createFeedRecord()]]),
    })),
    setCachedBatch: mock(() => {}),
    shouldRefreshFeed: mock((lastFetched: Date | null) => {
      if (!lastFetched) return true;
      return Date.now() - lastFetched.getTime() > 1000 * 60 * 30;
    }),
  });
}

beforeEach(() => {
  mock.restore();
  resetFeedFetcherDependenciesForTesting();
  registerModuleMocks();
});

afterEach(() => {
  mock.restore();
  resetFeedFetcherDependenciesForTesting();
});

describe("Feed Fetcher - URL Validation", () => {
  test("isAllowedFeedUrl accepts valid http URLs", async () => {
    expect(await isAllowedFeedUrl("http://example.com/feed")).toBe(true);
  });

  test("isAllowedFeedUrl accepts valid https URLs", async () => {
    expect(await isAllowedFeedUrl("https://example.com/feed")).toBe(true);
  });

  test("isAllowedFeedUrl rejects localhost", async () => {
    expect(await isAllowedFeedUrl("http://localhost/feed")).toBe(false);
  });

  test("isAllowedFeedUrl rejects 127.0.0.1", async () => {
    expect(await isAllowedFeedUrl("http://127.0.0.1/feed")).toBe(false);
  });

  test("isAllowedFeedUrl rejects private IP ranges", async () => {
    expect(await isAllowedFeedUrl("http://192.168.1.1/feed")).toBe(false);
    expect(await isAllowedFeedUrl("http://10.0.0.1/feed")).toBe(false);
    expect(await isAllowedFeedUrl("http://172.16.0.1/feed")).toBe(false);
  });

  test("isAllowedFeedUrl rejects file:// protocol", async () => {
    expect(await isAllowedFeedUrl("file:///etc/passwd")).toBe(false);
  });

  test("isAllowedFeedUrl rejects invalid URLs", async () => {
    expect(await isAllowedFeedUrl("not-a-url")).toBe(false);
  });

  test("PUBLIC_FEED_URL_ERROR is defined", () => {
    expect(PUBLIC_FEED_URL_ERROR).toBeDefined();
    expect(typeof PUBLIC_FEED_URL_ERROR).toBe("string");
  });
});

describe("Feed Fetcher - Error Handling", () => {
  test("isFeedSourceNotFoundError identifies FeedSourceNotFoundError", () => {
    const error = new Error(
      "Feed source not found for URL: https://example.com/feed",
    );
    error.name = "FeedSourceNotFoundError";
    expect(isFeedSourceNotFoundError(error)).toBe(true);
  });

  test("isFeedSourceNotFoundError rejects regular errors", () => {
    const error = new Error("Some other error");
    expect(isFeedSourceNotFoundError(error)).toBe(false);
  });

  test("isUpstreamFeedError identifies UpstreamFeedError", () => {
    const error = new Error("Upstream feed fetch failed");
    error.name = "UpstreamFeedError";
    expect(isUpstreamFeedError(error)).toBe(true);
  });

  test("isUpstreamFeedError rejects regular errors", () => {
    const error = new Error("Some other error");
    expect(isUpstreamFeedError(error)).toBe(false);
  });
});

describe("Feed Fetcher - Batch Operations", () => {
  test("fetchAndCacheFeedArticlesBatch handles empty feed list", async () => {
    const result = await fetchAndCacheFeedArticlesBatch(mockDb, 1, []);

    expect(result.articles.size).toBe(0);
    expect(result.errors.size).toBe(0);
    expect(result.refreshedCount).toBe(0);
    expect(result.cachedCount).toBe(0);
  });

  test("fetchAndCacheFeedArticlesBatch returns articles for valid feeds", async () => {
    const result = await fetchAndCacheFeedArticlesBatch(mockDb, 1, [
      "https://example.com/feed",
    ]);

    expect(result).toBeDefined();
    expect(result.articles).toBeInstanceOf(Map);
    expect(result.errors).toBeInstanceOf(Map);
    expect(typeof result.refreshedCount).toBe("number");
    expect(typeof result.cachedCount).toBe("number");
  });

  test("fetchAndCacheFeedArticlesBatch handles skipRefresh option", async () => {
    const result = await fetchAndCacheFeedArticlesBatch(
      mockDb,
      1,
      ["https://example.com/feed"],
      { skipRefresh: true },
    );

    expect(result).toBeDefined();
    expect(result.refreshedCount).toBeGreaterThanOrEqual(0);
  });

  test("fetchAndCacheFeedArticlesBatch handles forceRefresh option", async () => {
    const result = await fetchAndCacheFeedArticlesBatch(
      mockDb,
      1,
      ["https://example.com/feed"],
      { forceRefresh: true },
    );

    expect(result).toBeDefined();
  });

  test("fetchAndCacheFeedArticlesBatch tracks request source", async () => {
    const result = await fetchAndCacheFeedArticlesBatch(
      mockDb,
      1,
      ["https://example.com/feed"],
      { requestSource: "test-source" },
    );

    expect(result).toBeDefined();
  });

  test("fetchAndCacheFeedArticlesBatch handles multiple feeds", async () => {
    setFeedFetcherDependenciesForTesting({
      executeParallelRefreshes: mock(async () => ({
        cooldownLimitedCount: 0,
        errors: new Map<string, string>(),
        refreshedCount: 2,
        refreshedUrls: new Set<string>([
          "https://example.com/feed1",
          "https://example.com/feed2",
        ]),
      })),
      mapRowsToArticleMap: mock(() => new Map()),
      queryTopArticlesPerFeed: mock(async () => []),
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: ["https://example.com/feed1", "https://example.com/feed2"],
        feedByUrl: new Map([
          [
            "https://example.com/feed1",
            createFeedRecord({ id: 1, url: "https://example.com/feed1" }),
          ],
          [
            "https://example.com/feed2",
            createFeedRecord({ id: 2, url: "https://example.com/feed2" }),
          ],
        ]),
      })),
    });

    const result = await fetchAndCacheFeedArticlesBatch(mockDb, 1, [
      "https://example.com/feed1",
      "https://example.com/feed2",
    ]);

    expect(result.refreshedCount).toBeGreaterThanOrEqual(0);
  });

  test("fetchAndCacheFeedArticlesBatch handles unauthorized feeds", async () => {
    setFeedFetcherDependenciesForTesting({
      resolveAuthorizedFeedRecords: mock(async () => null),
    });

    const result = await fetchAndCacheFeedArticlesBatch(mockDb, 1, [
      "https://unauthorized.com/feed",
    ]);

    expect(result.articles.size).toBe(0);
    expect(result.refreshedCount).toBe(0);
  });

  test("fetchAndCacheFeedArticlesBatch handles upstream errors", async () => {
    setFeedFetcherDependenciesForTesting({
      executeParallelRefreshes: mock(async () => ({
        cooldownLimitedCount: 0,
        errors: new Map([["https://example.com/feed", "Network error"]]),
        refreshedCount: 0,
        refreshedUrls: new Set<string>(),
      })),
      mapRowsToArticleMap: mock(() => new Map()),
      queryTopArticlesPerFeed: mock(async () => []),
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: ["https://example.com/feed"],
        feedByUrl: new Map([
          [
            "https://example.com/feed",
            createFeedRecord({ lastFetched: new Date(0) }),
          ],
        ]),
      })),
    });

    const result = await fetchAndCacheFeedArticlesBatch(mockDb, 1, [
      "https://example.com/feed",
    ]);

    expect(result.errors).toBeInstanceOf(Map);
    expect(result.articles).toBeInstanceOf(Map);
  });

  test("fetchAndCacheFeedArticlesBatch looks up memory cache with the requested article limit", async () => {
    const getCachedBatch = mock(() => ({
      articles: new Map([["https://example.com/feed", []]]),
      cachedAt: Date.now(),
      errors: new Map<string, string>(),
      lastFetchedByUrl: new Map([
        ["https://example.com/feed", new Date("2026-03-14T12:00:00.000Z")],
      ]),
    }));
    setFeedFetcherDependenciesForTesting({
      getCachedBatch,
    });

    await fetchAndCacheFeedArticlesBatch(mockDb, 1, ["https://example.com/feed"], {
      articleLimit: 24,
      skipRefresh: true,
    });

    expect(getCachedBatch).toHaveBeenCalledWith(
      1,
      ["https://example.com/feed"],
      "all",
      24,
    );
  });

  test("fetchAndCacheFeedArticlesBatch omits unchanged cached feeds from article payloads", async () => {
    const lastFetchedAt = new Date("2026-03-14T12:00:00.000Z");
    setFeedFetcherDependenciesForTesting({
      getCachedBatch: mock(() => ({
        articles: new Map([
          [
            "https://example.com/feed",
            [
              {
                content: "cached article",
                feedId: 1,
                id: 10,
                isRead: false,
                isStarred: false,
                lastChecked: lastFetchedAt,
                link: "https://example.com/article",
                publicationDate: lastFetchedAt,
                title: "Cached",
              },
            ],
          ],
        ]),
        cachedAt: Date.now(),
        errors: new Map<string, string>(),
        lastFetchedByUrl: new Map([
          ["https://example.com/feed", lastFetchedAt],
        ]),
      })),
    });

    const result = await fetchAndCacheFeedArticlesBatch(
      mockDb,
      1,
      ["https://example.com/feed"],
      {
        knownLastFetchedAtByUrl: new Map([
          ["https://example.com/feed", lastFetchedAt],
        ]),
      },
    );

    expect(result.articles.size).toBe(0);
    expect(result.unchangedUrls).toEqual(new Set(["https://example.com/feed"]));
  });

  test("fetchAndCacheFeedArticlesBatch does not mark limited requests as unchanged", async () => {
    const lastFetchedAt = new Date("2026-03-14T12:00:00.000Z");
    const queryTopArticlesPerFeed = mock(async () => []);
    setFeedFetcherDependenciesForTesting({
      getCachedBatch: mock(() => null),
      queryTopArticlesPerFeed,
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: ["https://example.com/feed"],
        feedByUrl: new Map([
          [
            "https://example.com/feed",
            createFeedRecord({
              id: 1,
              lastFetched: lastFetchedAt,
              url: "https://example.com/feed",
            }),
          ],
        ]),
      })),
    });

    const result = await fetchAndCacheFeedArticlesBatch(
      mockDb,
      1,
      ["https://example.com/feed"],
      {
        articleLimit: 24,
        knownLastFetchedAtByUrl: new Map([
          ["https://example.com/feed", lastFetchedAt],
        ]),
        skipRefresh: true,
      },
    );

    expect(result.unchangedUrls.size).toBe(0);
    expect(queryTopArticlesPerFeed).toHaveBeenCalledWith(
      mockDb,
      1,
      [1],
      "all",
      24,
    );
  });

  test("fetchAndCacheFeedArticlesBatch queries only feeds whose timestamps changed", async () => {
    const queryTopArticlesPerFeed = mock(async () => []);
    setFeedFetcherDependenciesForTesting({
      executeParallelRefreshes: mock(async () => ({
        cooldownLimitedCount: 0,
        errors: new Map<string, string>(),
        refreshedCount: 1,
        refreshedUrls: new Set<string>(["https://example.com/feed-b"]),
      })),
      mapRowsToArticleMap: mock(
        () => new Map([["https://example.com/feed-b", []]]),
      ),
      queryTopArticlesPerFeed,
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: [
          "https://example.com/feed-a",
          "https://example.com/feed-b",
        ],
        feedByUrl: new Map([
          [
            "https://example.com/feed-a",
            createFeedRecord({
              id: 1,
              lastFetched: new Date("2026-03-14T11:00:00.000Z"),
              url: "https://example.com/feed-a",
            }),
          ],
          [
            "https://example.com/feed-b",
            createFeedRecord({
              id: 2,
              lastFetched: new Date("2026-03-14T11:00:00.000Z"),
              url: "https://example.com/feed-b",
            }),
          ],
        ]),
      })),
    });

    await fetchAndCacheFeedArticlesBatch(
      mockDb,
      1,
      ["https://example.com/feed-a", "https://example.com/feed-b"],
      {
        knownLastFetchedAtByUrl: new Map([
          ["https://example.com/feed-a", new Date("2026-03-14T11:00:00.000Z")],
        ]),
      },
    );

    expect(queryTopArticlesPerFeed).toHaveBeenCalledWith(
      mockDb,
      1,
      [2],
      "all",
      500,
    );
  });

  test("fetchAndCacheFeedArticlesBatch forwards an explicit article limit to the ranked query", async () => {
    const queryTopArticlesPerFeed = mock(async () => []);
    setFeedFetcherDependenciesForTesting({
      executeParallelRefreshes: mock(async () => ({
        cooldownLimitedCount: 0,
        errors: new Map<string, string>(),
        refreshedCount: 0,
        refreshedUrls: new Set<string>(),
      })),
      mapRowsToArticleMap: mock(
        () => new Map([["https://example.com/feed-a", []]]),
      ),
      queryTopArticlesPerFeed,
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: ["https://example.com/feed-a"],
        feedByUrl: new Map([
          [
            "https://example.com/feed-a",
            createFeedRecord({
              id: 1,
              lastFetched: new Date("2026-03-14T11:00:00.000Z"),
              url: "https://example.com/feed-a",
            }),
          ],
        ]),
      })),
    });

    await fetchAndCacheFeedArticlesBatch(mockDb, 1, ["https://example.com/feed-a"], {
      articleLimit: 12,
    });

    expect(queryTopArticlesPerFeed).toHaveBeenCalledWith(
      mockDb,
      1,
      [1],
      "all",
      12,
    );
  });

  test("fetchAndCacheFeedArticlesBatch handles feeds without records", async () => {
    setFeedFetcherDependenciesForTesting({
      executeParallelRefreshes: mock(async () => ({
        cooldownLimitedCount: 0,
        errors: new Map<string, string>(),
        refreshedCount: 0,
        refreshedUrls: new Set<string>(),
      })),
      mapRowsToArticleMap: mock(() => new Map()),
      queryTopArticlesPerFeed: mock(async () => []),
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: ["https://example.com/feed"],
        feedByUrl: new Map(),
      })),
    });

    const result = await fetchAndCacheFeedArticlesBatch(mockDb, 1, [
      "https://example.com/feed",
    ]);

    expect(result).toBeDefined();
  });

  test("fetchAndCacheFeedArticlesBatch resolves proxy transport only for stale proxied feeds", async () => {
    const executeParallelRefreshes = mock(async () => ({
      cooldownLimitedCount: 0,
      errors: new Map<string, string>(),
      refreshedCount: 1,
      refreshedUrls: new Set<string>(["https://example.com/feed"]),
    }));
    const resolveProxyTransport = mock(async () => ({
      allowInsecureTls: true,
      proxyUrl: "socks5://proxy.example:1080",
    }));

    setFeedFetcherDependenciesForTesting({
      executeParallelRefreshes,
      mapRowsToArticleMap: mock(() => new Map([["https://example.com/feed", []]])),
      queryTopArticlesPerFeed: mock(async () => []),
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: ["https://example.com/feed"],
        feedByUrl: new Map([
          [
            "https://example.com/feed",
            createFeedRecord({
              lastFetched: new Date(0),
              proxyEnabled: true,
            }),
          ],
        ]),
      })),
    });

    await fetchAndCacheFeedArticlesBatch(
      mockDb,
      1,
      ["https://example.com/feed"],
      { resolveProxyTransport },
    );

    expect(resolveProxyTransport).toHaveBeenCalledTimes(1);
    expect(executeParallelRefreshes).toHaveBeenCalledWith(
      mockDb,
      expect.any(Map),
      ["https://example.com/feed"],
      false,
      false,
      false,
      {
        allowInsecureTls: true,
        proxyUrl: "socks5://proxy.example:1080",
      },
    );
  });

  test("fetchAndCacheFeedArticlesBatch bypasses memory cache when forceResolveUpstream is enabled", async () => {
    const executeParallelRefreshes = mock(async () => ({
      cooldownLimitedCount: 0,
      errors: new Map<string, string>(),
      refreshedCount: 1,
      refreshedUrls: new Set<string>(["https://example.com/feed"]),
    }));
    const getCachedBatch = mock(() => ({
      articles: new Map([["https://example.com/feed", []]]),
      cachedAt: Date.now(),
      errors: new Map<string, string>(),
      lastFetchedByUrl: new Map([["https://example.com/feed", new Date()]]),
    }));

    setFeedFetcherDependenciesForTesting({
      executeParallelRefreshes,
      getCachedBatch,
      mapRowsToArticleMap: mock(() => new Map([["https://example.com/feed", []]])),
      queryTopArticlesPerFeed: mock(async () => []),
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: ["https://example.com/feed"],
        feedByUrl: new Map([
          [
            "https://example.com/feed",
            createFeedRecord({ lastFetched: new Date() }),
          ],
        ]),
      })),
    });

    await fetchAndCacheFeedArticlesBatch(
      mockDb,
      1,
      ["https://example.com/feed"],
      { forceResolveUpstream: true },
    );

    expect(getCachedBatch).toHaveBeenCalledTimes(1);
    expect(executeParallelRefreshes).toHaveBeenCalledWith(
      mockDb,
      expect.any(Map),
      ["https://example.com/feed"],
      false,
      true,
      true,
      undefined,
    );
  });
});

describe("Feed Fetcher - Single Feed Operations", () => {
  test("fetchAndCacheFeedArticles throws error for unauthorized feed", async () => {
    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          leftJoin: mock(() => ({
            where: mock(() => ({
              orderBy: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
          })),
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof getDb>;

    try {
      await fetchAndCacheFeedArticles(
        mockDbLocal,
        1,
        "https://example.com/feed",
      );
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(isFeedSourceNotFoundError(error)).toBe(true);
    }
  });

  test("fetchAndCacheFeedArticles fetches articles for valid feed", async () => {
    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          leftJoin: mock(() => ({
            where: mock(() => ({
              orderBy: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
          })),
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                { id: 1, url: "https://example.com/feed", userId: 1 },
              ]),
            ),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof getDb>;

    const articles = await fetchAndCacheFeedArticles(
      mockDbLocal,
      1,
      "https://example.com/feed",
    );

    expect(Array.isArray(articles)).toBe(true);
  });

  test("fetchAndCacheFeedArticles refreshes stale feed", async () => {
    setFeedFetcherDependenciesForTesting({
      ensureFeedRecordByUrl: mock(async () =>
        createFeedRecord({
          lastFetched: new Date(Date.now() - 1000 * 60 * 60 * 24),
        }),
      ),
      refreshFeedFromUpstream: mock(async () => ({ ok: true as const })),
      shouldRefreshFeed: mock(() => true),
    });

    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          leftJoin: mock(() => ({
            where: mock(() => ({
              orderBy: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
          })),
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                { id: 1, url: "https://example.com/feed", userId: 1 },
              ]),
            ),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof getDb>;

    const articles = await fetchAndCacheFeedArticles(
      mockDbLocal,
      1,
      "https://example.com/feed",
    );

    expect(Array.isArray(articles)).toBe(true);
  });

  test("fetchAndCacheFeedArticles throws UpstreamFeedError on refresh failure", async () => {
    setFeedFetcherDependenciesForTesting({
      ensureFeedRecordByUrl: mock(async () =>
        createFeedRecord({
          lastFetched: new Date(Date.now() - 1000 * 60 * 60 * 24),
        }),
      ),
      refreshFeedFromUpstream: mock(async () => ({
        error: "Network timeout",
        ok: false,
      })),
      shouldRefreshFeed: mock(() => true),
    });

    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                { id: 1, url: "https://example.com/feed", userId: 1 },
              ]),
            ),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof getDb>;

    try {
      await fetchAndCacheFeedArticles(
        mockDbLocal,
        1,
        "https://example.com/feed",
      );
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(isUpstreamFeedError(error)).toBe(true);
    }
  });

  test("fetchAndCacheFeedArticles uses cache for fresh feed", async () => {
    setFeedFetcherDependenciesForTesting({
      ensureFeedRecordByUrl: mock(async () =>
        createFeedRecord({
          lastFetched: new Date(),
        }),
      ),
      refreshFeedFromUpstream: mock(async () => ({ ok: true as const })),
      shouldRefreshFeed: mock(() => false),
    });

    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          leftJoin: mock(() => ({
            where: mock(() => ({
              orderBy: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
          })),
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                { id: 1, url: "https://example.com/feed", userId: 1 },
              ]),
            ),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof getDb>;

    const articles = await fetchAndCacheFeedArticles(
      mockDbLocal,
      1,
      "https://example.com/feed",
    );

    expect(Array.isArray(articles)).toBe(true);
  });

  test("fetchAndCacheFeedArticles resolves proxy transport for proxy-enabled stale feeds", async () => {
    const refreshFeedFromUpstream = mock(async () => ({ ok: true as const }));
    const resolveProxyTransport = mock(async () => ({
      allowInsecureTls: false,
      proxyUrl: "http://proxy.example:8080",
    }));

    setFeedFetcherDependenciesForTesting({
      ensureFeedRecordByUrl: mock(async () =>
        createFeedRecord({
          lastFetched: new Date(Date.now() - 1000 * 60 * 60 * 24),
        }),
      ),
      refreshFeedFromUpstream,
      shouldRefreshFeed: mock(() => true),
    });

    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          leftJoin: mock(() => ({
            where: mock(() => ({
              orderBy: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
          })),
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                {
                  id: 1,
                  proxyEnabled: true,
                  url: "https://example.com/feed",
                  userId: 1,
                },
              ]),
            ),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof getDb>;

    await fetchAndCacheFeedArticles(
      mockDbLocal,
      1,
      "https://example.com/feed",
      { resolveProxyTransport },
    );

    expect(resolveProxyTransport).toHaveBeenCalledTimes(1);
    expect(refreshFeedFromUpstream).toHaveBeenCalledWith(
      mockDbLocal,
      expect.objectContaining({
        proxyEnabled: true,
        url: "https://example.com/feed",
      }),
      {
        proxyTransport: {
          allowInsecureTls: false,
          proxyUrl: "http://proxy.example:8080",
        },
      },
    );
  });
});
