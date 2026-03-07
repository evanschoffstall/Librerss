/**
 * Comprehensive Tests: Google Reader Tag Handlers
 * Tests for src/lib/api/greader/tag.ts
 *
 * Focuses on uncovered paths:
 * - handleUnreadCount (completely untested)
 * - parseFormOrQueryParams error paths
 * - Edge cases for timestamp validation
 */

import { __resetArticleStatusesTableStateForTests } from "@/lib/core/article-status";
import type { SessionUser } from "@/lib/auth/session";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

beforeEach(() => {
  mock.restore();
  __resetArticleStatusesTableStateForTests();
});

afterEach(() => {
  mock.restore();
});

const mockUser: SessionUser = {
  sessionId: 1,
  userId: 42,
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
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
      select: mock(() => ({ from: mock(() => ({ limit: probeLimitMock })) })),
      execute: mock(async () => mockRows),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));

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
      select: mock(() => ({
        from: mock(() => ({
          limit: mock(async () => {
            throw missingErr;
          }),
        })),
      })),
      execute: mock(async () => mockRows),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));

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
      select: mock(() => ({
        from: mock(() => ({ limit: mock(async () => [{ id: 1 }]) })),
      })),
      execute: mock(async () => ({ rows: mockRows })),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));

    const { handleUnreadCount } = await import("@/lib/api/greader/tag");

    const response = await handleUnreadCount(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.unreadcounts[0].count).toBe(2);
    expect(data.unreadcounts[1].count).toBe(2);
  });

  test("handles empty feed list", async () => {
    const mockDb = {
      select: mock(() => ({
        from: mock(() => ({ limit: mock(async () => [{ id: 1 }]) })),
      })),
      execute: mock(async () => []),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));

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
      select: mock(() => ({
        from: mock(() => ({ limit: mock(async () => [{ id: 1 }]) })),
      })),
      execute: mock(async () => mockRows),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));

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
    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));
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
    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));
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
    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));
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
    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));
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
    return { db: { select, insert }, insert };
  }

  test("handles multiple tag operations in single request", async () => {
    const { db: mockDb, insert } = makeEditTagDb();
    mock.module("@/lib/db/db", () => ({ getDb: () => mockDb }));
    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/state/com.google/read");
    formData.append("a", "user/-/state/com.google/starred");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalled();
  });

  test("handles tags with no matching mutations", async () => {
    const { db: mockDb, insert } = makeEditTagDb();
    mock.module("@/lib/db/db", () => ({ getDb: () => mockDb }));
    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/label/SomeCustomLabel");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(200);
    expect(insert).not.toHaveBeenCalled();
  });

  test("handles both add and remove tags in single request", async () => {
    const { db: mockDb, insert } = makeEditTagDb();
    mock.module("@/lib/db/db", () => ({ getDb: () => mockDb }));
    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/state/com.google/read");
    formData.append("r", "user/-/state/com.google/starred");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalled();
  });

  test("handles duplicate article IDs", async () => {
    const { db: mockDb, insert } = makeEditTagDb();
    mock.module("@/lib/db/db", () => ({ getDb: () => mockDb }));
    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/state/com.google/read");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalled();
  });

  test("handles invalid article ID formats", async () => {
    mock.module("@/lib/db/db", () => ({ getDb: () => ({}) }));
    mock.module("@/lib/core/feed-cache", () => ({
      invalidateUserCache: mock(() => {}),
    }));
    const { handleEditTag } = await import("@/lib/api/greader/tag");
    const formData = new URLSearchParams();
    formData.append("i", "invalid-format");
    formData.append("i", "also-invalid");
    formData.append("a", "user/-/state/com.google/read");
    const request = new NextRequest("https://example.com/api/edit-tag", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const response = await handleEditTag(mockUser, request);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("InvalidParameters");
  });
});
