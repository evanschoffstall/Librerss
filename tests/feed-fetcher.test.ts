/**
 * Comprehensive Tests: Feed Fetcher Module
 * Tests for src/lib/core/feed-fetcher.ts
 */

import {
  fetchAndCacheFeedArticles,
  fetchAndCacheFeedArticlesBatch,
  isFeedSourceNotFoundError,
  isUpstreamFeedError,
  resetFeedFetcherDependenciesForTesting,
  setFeedFetcherDependenciesForTesting,
} from "@/lib/core/feed-fetcher";
import type { FeedRecord } from "@/lib/core/feed-refresh";
import {
  isAllowedFeedUrl,
  PUBLIC_FEED_URL_ERROR,
} from "@/lib/core/feed-url-validator";
import type { getDb } from "@/lib/db/db";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Mock dependencies
const mockDb = {
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
  insert: mock(() => ({
    into: mock(() => ({
      values: mock(() => ({
        onConflictDoNothing: mock(() => ({
          returning: mock(() => Promise.resolve([])),
        })),
      })),
    })),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([{ id: 1 }])),
      })),
    })),
  })),
  transaction: mock(async (callback: any) => {
    return callback(mockDb);
  }),
} as unknown as ReturnType<typeof getDb>;

function createFeedRecord(overrides: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: 1,
    url: "https://example.com/feed",
    lastFetched: new Date(Date.now() - 1000 * 60 * 60),
    lastFetchError: null,
    ...overrides,
  };
}

function registerModuleMocks() {
  setFeedFetcherDependenciesForTesting({
    getCachedBatch: mock(() => null),
    setCachedBatch: mock(() => {}),
    invalidateUserCache: mock(() => {}),
    ensureFeedRecordByUrl: mock(async () => createFeedRecord()),
    refreshFeedFromUpstream: mock(async () => ({ ok: true as const })),
    shouldRefreshFeed: mock((lastFetched: Date | null) => {
      if (!lastFetched) return true;
      return Date.now() - lastFetched.getTime() > 1000 * 60 * 30;
    }),
    resolveAuthorizedFeedRecords: mock(async () => ({
      allowedUrls: ["https://example.com/feed"],
      feedByUrl: new Map([["https://example.com/feed", createFeedRecord()]]),
    })),
    executeParallelRefreshes: mock(async () => ({
      errors: new Map<string, string>(),
      refreshedCount: 1,
      cooldownLimitedCount: 0,
      refreshedUrls: new Set<string>(["https://example.com/feed"]),
    })),
    queryTopArticlesPerFeed: mock(async () => []),
    mapRowsToArticleMap: mock(() => new Map()),
    diagInfo: mock(() => {}),
    diagWarn: mock(() => {}),
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
      executeParallelRefreshes: mock(async () => ({
        errors: new Map<string, string>(),
        refreshedCount: 2,
        cooldownLimitedCount: 0,
        refreshedUrls: new Set<string>([
          "https://example.com/feed1",
          "https://example.com/feed2",
        ]),
      })),
      queryTopArticlesPerFeed: mock(async () => []),
      mapRowsToArticleMap: mock(() => new Map()),
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
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: ["https://example.com/feed"],
        feedByUrl: new Map([
          [
            "https://example.com/feed",
            createFeedRecord({ lastFetched: new Date(0) }),
          ],
        ]),
      })),
      executeParallelRefreshes: mock(async () => ({
        errors: new Map([["https://example.com/feed", "Network error"]]),
        refreshedCount: 0,
        cooldownLimitedCount: 0,
        refreshedUrls: new Set<string>(),
      })),
      queryTopArticlesPerFeed: mock(async () => []),
      mapRowsToArticleMap: mock(() => new Map()),
    });

    const result = await fetchAndCacheFeedArticlesBatch(mockDb, 1, [
      "https://example.com/feed",
    ]);

    expect(result.errors).toBeInstanceOf(Map);
    expect(result.articles).toBeInstanceOf(Map);
  });

  test("fetchAndCacheFeedArticlesBatch handles feeds without records", async () => {
    setFeedFetcherDependenciesForTesting({
      resolveAuthorizedFeedRecords: mock(async () => ({
        allowedUrls: ["https://example.com/feed"],
        feedByUrl: new Map(),
      })),
      executeParallelRefreshes: mock(async () => ({
        errors: new Map<string, string>(),
        refreshedCount: 0,
        cooldownLimitedCount: 0,
        refreshedUrls: new Set<string>(),
      })),
      queryTopArticlesPerFeed: mock(async () => []),
      mapRowsToArticleMap: mock(() => new Map()),
    });

    const result = await fetchAndCacheFeedArticlesBatch(mockDb, 1, [
      "https://example.com/feed",
    ]);

    expect(result).toBeDefined();
  });
});

describe("Feed Fetcher - Single Feed Operations", () => {
  test("fetchAndCacheFeedArticles throws error for unauthorized feed", async () => {
    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
          leftJoin: mock(() => ({
            where: mock(() => ({
              orderBy: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
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
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                { id: 1, userId: 1, url: "https://example.com/feed" },
              ]),
            ),
          })),
          leftJoin: mock(() => ({
            where: mock(() => ({
              orderBy: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
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
      shouldRefreshFeed: mock(() => true),
      refreshFeedFromUpstream: mock(async () => ({ ok: true as const })),
    });

    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                { id: 1, userId: 1, url: "https://example.com/feed" },
              ]),
            ),
          })),
          leftJoin: mock(() => ({
            where: mock(() => ({
              orderBy: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
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
      shouldRefreshFeed: mock(() => true),
      refreshFeedFromUpstream: mock(async () => ({
        ok: false,
        error: "Network timeout",
      })),
    });

    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                { id: 1, userId: 1, url: "https://example.com/feed" },
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
      shouldRefreshFeed: mock(() => false),
      refreshFeedFromUpstream: mock(async () => ({ ok: true as const })),
    });

    const mockDbLocal = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                { id: 1, userId: 1, url: "https://example.com/feed" },
              ]),
            ),
          })),
          leftJoin: mock(() => ({
            where: mock(() => ({
              orderBy: mock(() => ({
                limit: mock(() => Promise.resolve([])),
              })),
            })),
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
});
