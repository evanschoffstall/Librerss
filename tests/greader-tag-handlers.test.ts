/**
 * Comprehensive Tests: Google Reader Tag Handlers
 * Tests for src/lib/api/greader/tag.ts
 *
 * Focuses on uncovered paths:
 * - handleUnreadCount (completely untested)
 * - parseFormOrQueryParams error paths
 * - Edge cases for timestamp validation
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { NextRequest } from "next/server";

import type { SessionUser } from "@/lib/auth/session";
import { resetArticleStatusTableStateForTests } from "@/lib/core/article-status";
import * as realFeedCacheModule from "@/lib/core/feed-cache";

beforeEach(() => mock.restore());

function mockFeedCacheModule() {
  mock.module("@/lib/core/feed-cache", () => ({
    ...realFeedCacheModule,
    invalidateUserCache: mock(() => {}),
  }));
}

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

describe("handleUnreadCount", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("returns unread counts with article statuses enabled", async () => {
    const mockRows = [
      { sourceUrl: "https://feed1.example.com/rss", unreadCount: 5 },
      { sourceUrl: "https://feed2.example.com/rss", unreadCount: 3 },
    ];

    const probeLimitMock = mock(async () => [{ id: 1 }]);
    const mockDb = {
      execute: mock(async () => mockRows),
      select: mock(() => ({ from: mock(() => ({ limit: probeLimitMock })) })),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mockFeedCacheModule();

    const { handleUnreadCount } = await import("@/lib/api/greader/tag");

    const response = await handleUnreadCount(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("unreadcounts");
    expect(data.unreadcounts).toBeArray();
    expect(data.unreadcounts.length).toBe(3); // reading list + 2 feeds
    expect(data.unreadcounts[0].id).toContain("reading-list");
    expect(data.unreadcounts[0].count).toBe(8); // 5 + 3
    expect(data.unreadcounts[1].id).toContain("feed1.example.com");
    expect(data.unreadcounts[1].count).toBe(5);
    expect(data.unreadcounts[2].id).toContain("feed2.example.com");
    expect(data.unreadcounts[2].count).toBe(3);
    expect(data.max).toBeNumber();
  });

  test("returns unread counts with article statuses disabled", async () => {
    const mockRows = [
      { sourceUrl: "https://feed1.example.com/rss", unreadCount: 10 },
      { sourceUrl: "https://feed2.example.com/rss", unreadCount: 7 },
    ];

    const missingErr = Object.assign(
      new Error('relation "ArticleStatus" does not exist'),
      { code: "42P01" },
    );
    const mockDb = {
      execute: mock(async () => mockRows),
      select: mock(() => ({
        from: mock(() => ({
          limit: mock(async () => {
            throw missingErr;
          }),
        })),
      })),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mockFeedCacheModule();

    const { handleUnreadCount } = await import("@/lib/api/greader/tag");

    const response = await handleUnreadCount(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("unreadcounts");
    expect(data.unreadcounts).toBeArray();
    expect(data.unreadcounts.length).toBe(3); // reading list + 2 feeds
    expect(data.unreadcounts[0].count).toBe(17); // 10 + 7
  });

  test("handles database returning rows property", async () => {
    const mockRows = [
      { sourceUrl: "https://feed1.example.com/rss", unreadCount: 2 },
    ];

    const mockDb = {
      execute: mock(async () => ({ rows: mockRows })),
      select: mock(() => ({
        from: mock(() => ({ limit: mock(async () => [{ id: 1 }]) })),
      })),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mockFeedCacheModule();

    const { handleUnreadCount } = await import("@/lib/api/greader/tag");

    const response = await handleUnreadCount(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.unreadcounts[0].count).toBe(2);
    expect(data.unreadcounts[1].count).toBe(2);
  });

  test("handles empty feed list", async () => {
    const mockDb = {
      execute: mock(async () => []),
      select: mock(() => ({
        from: mock(() => ({ limit: mock(async () => [{ id: 1 }]) })),
      })),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mockFeedCacheModule();

    const { handleUnreadCount } = await import("@/lib/api/greader/tag");

    const response = await handleUnreadCount(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.unreadcounts).toBeArray();
    expect(data.unreadcounts.length).toBe(1); // only reading list
    expect(data.unreadcounts[0].count).toBe(0);
  });

  test("handles null unreadCount values", async () => {
    const mockRows = [
      { sourceUrl: "https://feed1.example.com/rss", unreadCount: null },
      { sourceUrl: "https://feed2.example.com/rss", unreadCount: 5 },
    ];

    const mockDb = {
      execute: mock(async () => mockRows),
      select: mock(() => ({
        from: mock(() => ({ limit: mock(async () => [{ id: 1 }]) })),
      })),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mockFeedCacheModule();

    const { handleUnreadCount } = await import("@/lib/api/greader/tag");

    const response = await handleUnreadCount(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.unreadcounts[0].count).toBe(5); // 0 + 5
    expect(data.unreadcounts[1].count).toBe(0); // null handled
    expect(data.unreadcounts[2].count).toBe(5);
  });
});

describe("handleMarkAllAsRead - error paths", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("rejects invalid timestamp (NaN)", async () => {
    mock.module("@/lib/db/db", () => ({ getDb: () => ({}) }));
    mockFeedCacheModule();
    const { handleMarkAllAsRead } = await import("@/lib/api/greader/tag");
    const request = new NextRequest(
      "https://example.com/api/mark-all-as-read?s=user/-/state/com.google/reading-list&ts=invalid",
      { method: "POST" },
    );
    const response = await handleMarkAllAsRead(mockUser, request);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("MissingTimestamp");
  });

  test("rejects zero timestamp", async () => {
    mock.module("@/lib/db/db", () => ({ getDb: () => ({}) }));
    mockFeedCacheModule();
    const { handleMarkAllAsRead } = await import("@/lib/api/greader/tag");
    const request = new NextRequest(
      "https://example.com/api/mark-all-as-read?s=user/-/state/com.google/reading-list&ts=0",
      { method: "POST" },
    );
    const response = await handleMarkAllAsRead(mockUser, request);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("MissingTimestamp");
  });

  test("rejects negative timestamp", async () => {
    mock.module("@/lib/db/db", () => ({ getDb: () => ({}) }));
    mockFeedCacheModule();
    const { handleMarkAllAsRead } = await import("@/lib/api/greader/tag");
    const request = new NextRequest(
      "https://example.com/api/mark-all-as-read?s=user/-/state/com.google/reading-list&ts=-1000",
      { method: "POST" },
    );
    const response = await handleMarkAllAsRead(mockUser, request);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("MissingTimestamp");
  });

  test("rejects Infinity timestamp", async () => {
    mock.module("@/lib/db/db", () => ({ getDb: () => ({}) }));
    mockFeedCacheModule();
    const { handleMarkAllAsRead } = await import("@/lib/api/greader/tag");
    const request = new NextRequest(
      "https://example.com/api/mark-all-as-read?s=user/-/state/com.google/reading-list&ts=Infinity",
      { method: "POST" },
    );
    const response = await handleMarkAllAsRead(mockUser, request);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("MissingTimestamp");
  });
});

describe("handleEditTag - error paths and edge cases", () => {
  beforeEach(() => {
    mock.restore();
  });

  function makeEditTagDb() {
    const onConflictDoUpdate = mock(async () => []);
    const values = mock(() => ({ onConflictDoUpdate }));
    const insert = mock(() => ({ values }));
    const select = mock(() => ({
      from: mock(() => ({ limit: mock(async () => [{ id: 1 }]) })),
    }));
    const db: Record<string, unknown> = { insert, select };
    db.transaction = async (cb: (tx: typeof db) => Promise<void>) => cb(db);
    return { db, insert };
  }

  test("handles multiple tag operations in single request", async () => {
    const { db: mockDb, insert } = makeEditTagDb();
    mock.module("@/lib/db/db", () => ({ getDb: () => mockDb }));
    mockFeedCacheModule();
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/state/com.google/read");
    formData.append("a", "user/-/state/com.google/starred");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      body: formData.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalled();
  });

  test("handles tags with no matching mutations", async () => {
    const { db: mockDb, insert } = makeEditTagDb();
    mock.module("@/lib/db/db", () => ({ getDb: () => mockDb }));
    mockFeedCacheModule();
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/label/SomeCustomLabel");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      body: formData.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(200);
    expect(insert).not.toHaveBeenCalled();
  });

  test("handles both add and remove tags in single request", async () => {
    const { db: mockDb, insert } = makeEditTagDb();
    mock.module("@/lib/db/db", () => ({ getDb: () => mockDb }));
    mockFeedCacheModule();
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/state/com.google/read");
    formData.append("r", "user/-/state/com.google/starred");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      body: formData.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalled();
  });

  test("handles duplicate article IDs", async () => {
    const { db: mockDb, insert } = makeEditTagDb();
    mock.module("@/lib/db/db", () => ({ getDb: () => mockDb }));
    mockFeedCacheModule();
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/state/com.google/read");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      body: formData.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalled();
  });

  test("handles invalid article ID formats", async () => {
    mock.module("@/lib/db/db", () => ({ getDb: () => ({}) }));
    mockFeedCacheModule();
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "invalid-format");
    formData.append("i", "also-invalid");
    formData.append("a", "user/-/state/com.google/read");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      body: formData.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("InvalidParameters");
  });
});

// ── lib/api/greader/tag – handleMarkAllAsRead parseFormOrQueryParams error ─────

describe("lib/api/greader/tag – handleMarkAllAsRead early return on parse error", () => {
  let savedDbUrl: string | undefined;
  beforeEach(() => {
    savedDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
  });
  afterEach(() => {
    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
    mock.restore();
  });

  test("returns 413 when POST body exceeds limit", async () => {
    const { handleMarkAllAsRead } = await import("@/lib/api/greader/tag");
    const user = {
      email: "test@example.com",
      expiresAt: new Date(),
      sessionId: 0,
      sessionToken: "tok",
      userId: 1,
    };
    const bigBody = "s=" + "x".repeat(1024 * 1024 + 1);
    const req = new Request(
      "https://example.com/greader.php/api/0/mark-all-as-read",
      {
        body: bigBody,
        headers: {
          "content-length": String(Buffer.byteLength(bigBody)),
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
    );
    const result = await handleMarkAllAsRead(user as any, req as any);
    expect(result.status).toBe(413);
  });
});

// ── lib/api/greader/tag-labels – handleDisableTag too-large body (line 78) ────

describe("lib/api/greader/tag-labels – handleDisableTag early Response return", () => {
  test("returns Response early when body is too large (line 78)", async () => {
    const { NextRequest } = await import("next/server");
    const { handleDisableTag } = await import("@/lib/api/greader/tag-labels");
    const user = { email: "test@example.com", sessionToken: "tok", userId: 1 };
    const req = new NextRequest("https://dummy.local/api/greader/tag/disable", {
      body: "s=user%2Flabel%2FTest",
      headers: {
        // Content-Length value drastically exceeds MAX_JSON_BODY_BYTES
        "content-length": "999999999",
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    const result = await handleDisableTag(user as any, req);
    expect(result.status).toBe(413);
  });
});
