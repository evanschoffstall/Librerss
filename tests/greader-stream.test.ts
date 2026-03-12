/**
 * Comprehensive Tests: Google Reader Stream Contents Handler
 * Tests for src/lib/api/greader/stream-contents.ts
 *
 * Coverage: Main handler flow, stream types, pagination, filtering, query paths
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { NextRequest } from "next/server";

import type { SessionUser } from "@/lib/auth/session";
import { resetArticleStatusTableStateForTests } from "@/lib/core/article-status";

beforeEach(() => mock.restore());

beforeEach(() => {
  mock.restore();
  resetArticleStatusTableStateForTests();
});

afterEach(() => {
  mock.restore();
});

const mockUser: SessionUser = {
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
  sessionId: 1,
  userId: 42,
};

const createMockArticle = (id: number, overrides = {}) => ({
  articleId: id,
  category: "Tech",
  content: `Content for article ${id}`,
  isRead: false,
  isStarred: false,
  link: `https://example.com/article/${id}`,
  publicationDate: new Date(Date.now() - id * 1000 * 60),
  sourceName: `Source ${id}`,
  sourceUrl: `https://source${id}.com/feed`,
  title: `Article ${id}`,
  ...overrides,
});

function createMockDb(mockRows: unknown[] = [], probeShouldFail = false) {
  const missingErr = probeShouldFail
    ? Object.assign(new Error('relation "ArticleStatus" does not exist'), {
        code: "42P01",
      })
    : null;
  const queryBuilder: Record<string, unknown> = {
    innerJoin: mock(() => queryBuilder),
    leftJoin: mock(() => queryBuilder),
    limit: mock(() => queryBuilder),
    offset: mock(() => Promise.resolve(mockRows)),
    orderBy: mock(() => queryBuilder),
    then: missingErr
      ? (_: unknown, reject: (e: Error) => void) => reject(missingErr)
      : (resolve: (v: unknown[]) => void) => resolve([]),
    where: mock(() => queryBuilder),
  };

  return {
    select: mock(() => ({
      from: mock(() => queryBuilder),
    })),
  };
}

function setupMocks(
  options: {
    dbRows?: unknown[];
    useArticleStatuses?: boolean;
  } = {},
) {
  const { dbRows = [], useArticleStatuses = true } = options;

  const mockDb = createMockDb(dbRows, !useArticleStatuses);

  mock.module("@/lib/db/db", () => ({
    getDb: () => mockDb,
  }));

  mock.module("@/lib/logger", () => ({
    logger: {
      error: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
    },
  }));

  mock.module("@/lib/api/greader/stream-refresh", () => ({
    maybeRefreshGReaderStreamFeeds: mock(async () => {}),
  }));

  return mockDb;
}

describe("handleStreamContents", () => {
  describe("Stream Type Handling", () => {
    test("handles reading list stream", async () => {
      const mockArticles = [
        createMockArticle(1),
        createMockArticle(2),
        createMockArticle(3),
      ];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe("user/-/state/com.google/reading-list");
      expect(data.direction).toBe("ltr");
      expect(data.items).toHaveLength(3);
      expect(data).toHaveProperty("updated");
    });

    test("handles starred stream", async () => {
      const mockArticles = [
        createMockArticle(1, { isStarred: true }),
        createMockArticle(2, { isStarred: true }),
      ];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/starred",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/starred",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe("user/-/state/com.google/starred");
      expect(data.items).toHaveLength(2);
    });

    test("handles feed stream", async () => {
      const mockArticles = [createMockArticle(1), createMockArticle(2)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const feedUrl = "https://example.com/feed";
      const request = new NextRequest(
        `https://example.com/reader/api/0/stream/contents/feed/${encodeURIComponent(feedUrl)}`,
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        `stream/contents/feed/${feedUrl}`,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(`feed/${feedUrl}`);
      expect(data.items).toHaveLength(2);
    });

    test("returns empty items for unknown stream type", async () => {
      setupMocks({ dbRows: [] });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/unknown-stream-type",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/unknown-stream-type",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe("unknown-stream-type");
      expect(data.items).toEqual([]);
    });

    test("returns empty items for starred stream without article statuses table", async () => {
      setupMocks({ dbRows: [], useArticleStatuses: false });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/starred",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/starred",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe("user/-/state/com.google/starred");
      expect(data.items).toEqual([]);
      expect(data).toHaveProperty("updated");
    });
  });

  describe("Pagination", () => {
    test("handles default pagination", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.continuation).toBeUndefined();
    });

    test("handles n parameter for page size", async () => {
      const mockArticles = Array.from({ length: 5 }, (_, i) =>
        createMockArticle(i + 1),
      );
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=5",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(5);
      expect(data.continuation).toBe("5");
    });

    test("returns continuation ID when more items available", async () => {
      const mockArticles = Array.from({ length: 20 }, (_, i) =>
        createMockArticle(i + 1),
      );
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=20",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      const data = await response.json();
      expect(data.continuation).toBe("20");
    });

    test("handles continuation ID parameter", async () => {
      const mockArticles = [createMockArticle(100), createMockArticle(101)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?c=150",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(2);
    });

    test("handles offset-based continuation", async () => {
      const mockArticles = [createMockArticle(10), createMockArticle(11)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?c=offset:20",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(2);
    });

    test("does not return continuation when fewer items than limit", async () => {
      const mockArticles = [createMockArticle(1), createMockArticle(2)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=10",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      const data = await response.json();
      expect(data.continuation).toBeUndefined();
    });
  });

  describe("User Agent Handling", () => {
    test("handles NetNewsWire user agent", async () => {
      const mockArticles = Array.from({ length: 10 }, (_, i) =>
        createMockArticle(i + 1),
      );
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
        {
          headers: {
            "user-agent": "NetNewsWire/6.0",
          },
        },
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(10);
    });

    test("handles standard user agent", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
        {
          headers: {
            "user-agent": "Mozilla/5.0",
          },
        },
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });

    test("handles missing user agent header", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });
  });

  describe("Date Filtering", () => {
    test("handles olderThan parameter", async () => {
      const mockArticles = [createMockArticle(1), createMockArticle(2)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const olderThan = Math.floor(Date.now() / 1000);
      const request = new NextRequest(
        `https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?ot=${olderThan}`,
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(2);
    });

    test("falls back to query without date filter when no results", async () => {
      let callCount = 0;
      const mockDb = {
        select: mock(() => ({
          from: mock(() => ({
            innerJoin: mock(() => ({
              innerJoin: mock(() => ({
                leftJoin: mock(() => ({
                  leftJoin: mock(() => ({
                    where: mock(() => ({
                      orderBy: mock(() => ({
                        limit: mock(() => ({
                          offset: mock(() => {
                            callCount++;
                            if (callCount === 1) {
                              return Promise.resolve([]);
                            }
                            return Promise.resolve([
                              createMockArticle(1),
                              createMockArticle(2),
                            ]);
                          }),
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
            limit: mock(() => ({
              then: (resolve: (v: unknown[]) => void) => resolve([]),
            })), // probe path
          })),
        })),
      };

      mock.module("@/lib/db/db", () => ({
        getDb: () => mockDb,
      }));

      mock.module("@/lib/logger", () => ({
        logger: {
          error: mock(() => {}),
          info: mock(() => {}),
          warn: mock(() => {}),
        },
      }));

      mock.module("@/lib/api/greader/stream-refresh", () => ({
        maybeRefreshGReaderStreamFeeds: mock(async () => {}),
      }));

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const olderThan = Math.floor(Date.now() / 1000);
      const request = new NextRequest(
        `https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?ot=${olderThan}`,
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(2);
      expect(callCount).toBe(2);
    });

    test("does not fall back when date filter returns results", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const olderThan = Math.floor(Date.now() / 1000);
      const request = new NextRequest(
        `https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?ot=${olderThan}`,
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });
  });

  describe("Read Filtering", () => {
    test("handles exclude read parameter", async () => {
      const mockArticles = [
        createMockArticle(1, { isRead: false }),
        createMockArticle(2, { isRead: false }),
      ];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?xt=user/-/state/com.google/read",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(2);
    });

    test("returns all articles without exclude read parameter", async () => {
      const mockArticles = [
        createMockArticle(1, { isRead: true }),
        createMockArticle(2, { isRead: false }),
      ];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(2);
    });
  });

  describe("Database Query Paths", () => {
    test("uses article statuses table when available", async () => {
      const mockArticles = [
        createMockArticle(1, { isRead: true, isStarred: false }),
      ];
      setupMocks({ dbRows: mockArticles, useArticleStatuses: true });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });

    test("uses fallback when article statuses table unavailable", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles, useArticleStatuses: false });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });
  });

  describe("Category Resolution", () => {
    test("resolves categories via withResolvedCategoryByUrl", async () => {
      const mockArticles = [createMockArticle(1, { category: null })];
      setupMocks({
        dbRows: mockArticles,
      });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });

    test("handles articles with existing categories", async () => {
      const mockArticles = [createMockArticle(1, { category: "Tech" })];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });
  });

  describe("Feed-Specific Streams", () => {
    test("handles encoded feed URLs", async () => {
      const mockArticles = [createMockArticle(1), createMockArticle(2)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const feedUrl = "https://example.com/feed?param=value";
      const request = new NextRequest(
        `https://example.com/reader/api/0/stream/contents/feed/${encodeURIComponent(feedUrl)}`,
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        `stream/contents/feed/${feedUrl}`,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(`feed/${feedUrl}`);
      expect(data.items).toHaveLength(2);
    });

    test("handles feed stream with special characters", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const feedUrl = "https://example.com/feed with spaces";
      const request = new NextRequest(
        `https://example.com/reader/api/0/stream/contents/feed/${encodeURIComponent(feedUrl)}`,
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        `stream/contents/feed/${feedUrl}`,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });
  });

  describe("Combined Filters", () => {
    test("handles pagination with date filter", async () => {
      const mockArticles = Array.from({ length: 10 }, (_, i) =>
        createMockArticle(i + 1),
      );
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const olderThan = Math.floor(Date.now() / 1000);
      const request = new NextRequest(
        `https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=10&ot=${olderThan}`,
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(10);
    });

    test("handles pagination with continuation and exclude read", async () => {
      const mockArticles = Array.from({ length: 20 }, (_, i) =>
        createMockArticle(i + 100, { isRead: false }),
      );
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=20&c=150&xt=user/-/state/com.google/read",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(20);
      expect(data.continuation).toBe("119");
    });

    test("handles feed stream with all filters", async () => {
      const mockArticles = Array.from({ length: 15 }, (_, i) =>
        createMockArticle(i + 1, { isRead: false }),
      );
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const feedUrl = "https://example.com/feed";
      const olderThan = Math.floor(Date.now() / 1000);
      const request = new NextRequest(
        `https://example.com/reader/api/0/stream/contents/feed/${encodeURIComponent(feedUrl)}?n=15&ot=${olderThan}&xt=user/-/state/com.google/read`,
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        `stream/contents/feed/${feedUrl}`,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(15);
    });
  });

  describe("Edge Cases", () => {
    test("handles empty result set", async () => {
      setupMocks({ dbRows: [] });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toEqual([]);
      expect(data.continuation).toBeUndefined();
    });

    test("handles single article result", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=20",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
      expect(data.continuation).toBeUndefined();
    });

    test("handles large page size", async () => {
      const mockArticles = Array.from({ length: 50 }, (_, i) =>
        createMockArticle(i + 1),
      );
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=1000",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(50);
    });

    test("handles invalid continuation ID gracefully", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?c=invalid",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });

    test("handles articles with null fields", async () => {
      const mockArticles = [
        createMockArticle(1, {
          category: null,
          isRead: null,
          isStarred: null,
        }),
      ];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });
  });

  describe("Response Format", () => {
    test("returns correct response structure", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      const data = await response.json();
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("direction");
      expect(data).toHaveProperty("updated");
      expect(data).toHaveProperty("items");
      expect(data.direction).toBe("ltr");
      expect(typeof data.updated).toBe("number");
      expect(Array.isArray(data.items)).toBe(true);
    });

    test("includes continuation when present", async () => {
      const mockArticles = Array.from({ length: 20 }, (_, i) =>
        createMockArticle(i + 1),
      );
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=20",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      const data = await response.json();
      expect(data).toHaveProperty("continuation");
      expect(typeof data.continuation).toBe("string");
    });

    test("omits continuation when not needed", async () => {
      const mockArticles = [createMockArticle(1)];
      setupMocks({ dbRows: mockArticles });

      const { handleStreamContents } =
        await import("@/lib/api/greader/stream-contents");

      const request = new NextRequest(
        "https://example.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      );

      const response = await handleStreamContents(
        mockUser,
        request,
        "stream/contents/user/-/state/com.google/reading-list",
      );

      const data = await response.json();
      expect(data.continuation).toBeUndefined();
    });
  });
});
