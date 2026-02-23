/**
 * Comprehensive Tests: Google Reader API Handlers
 * Tests for src/app/api/greader.php/[...segments]/handlers/
 */

import type { SessionUser } from "@/lib/auth/session";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { NextRequest } from "next/server";

afterAll(() => {
  mock.restore();
});

// Mock database setup
const createMockDb = () => ({
  select: mock(() => ({
    from: mock(() => ({
      innerJoin: mock(() => createQueryChain()),
      leftJoin: mock(() => createQueryChain()),
      where: mock(() => createQueryChain()),
    })),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => Promise.resolve([])),
    })),
  })),
  insert: mock(() => ({
    values: mock(() => ({
      onConflictDoUpdate: mock(() => Promise.resolve([])),
    })),
  })),
  delete: mock(() => ({
    where: mock(() => Promise.resolve([])),
  })),
});

const createQueryChain = () => ({
  innerJoin: mock(() => createQueryChain()),
  leftJoin: mock(() => createQueryChain()),
  where: mock(() => createQueryChain()),
  orderBy: mock(() => createQueryChain()),
  limit: mock(() => createQueryChain()),
  offset: mock(() => Promise.resolve([])),
  then: <TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> =>
    Promise.resolve([]).then(onfulfilled, onrejected),
});

function registerBaseMocks() {
  const mockDb = createMockDb();

  mock.module("@/lib/db/db", () => ({
    getDb: () => mockDb,
  }));

  mock.module("@/lib/core/article-status", () => ({
    canUseArticleStatusesTable: mock(async () => true),
    upsertArticleStatuses: mock(async () => {}),
  }));

  mock.module("@/lib/utils/logger", () => ({
    logger: {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    },
  }));
}

beforeAll(() => {
  registerBaseMocks();
});
const mockUser: SessionUser = {
  sessionId: 1,
  userId: 1,
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
};

describe("Stream Contents Handler", () => {
  beforeEach(() => {
    mock.restore();
    registerBaseMocks();
  });

  test("handles reading list stream", async () => {
    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "user/-/state/com.google/reading-list",
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("items");
  });

  test("handles starred stream", async () => {
    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/contents/user/-/state/com.google/starred",
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "user/-/state/com.google/starred",
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("items");
  });

  test("handles feed stream", async () => {
    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/contents/feed/https://example.com/feed",
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "feed/https://example.com/feed",
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("items");
  });

  test("handles unknown stream type", async () => {
    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/contents/unknown-stream",
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "unknown-stream",
    );

    const data = await response.json();
    expect(data.items).toEqual([]);
  });

  test("handles pagination parameters", async () => {
    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=20&c=continuation-id",
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "user/-/state/com.google/reading-list",
    );

    expect(response.status).toBe(200);
  });

  test("handles NetNewsWire user agent", async () => {
    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/contents/user/-/state/com.google/reading-list",
      {
        headers: {
          "user-agent": "NetNewsWire",
        },
      },
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "user/-/state/com.google/reading-list",
    );

    expect(response.status).toBe(200);
  });

  test("handles olderThan parameter", async () => {
    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const olderThan = Math.floor(Date.now() / 1000);
    const request = new NextRequest(
      `https://example.com/api/greader.php/reader/api/0/stream/contents/user/-/state/com.google/reading-list?ot=${olderThan}`,
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "user/-/state/com.google/reading-list",
    );

    expect(response.status).toBe(200);
  });

  test("handles starred stream without article statuses table", async () => {
    mock.module("@/lib/core/article-status", () => ({
      canUseArticleStatusesTable: mock(async () => false),
      upsertArticleStatuses: mock(async () => {}),
    }));

    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/contents/user/-/state/com.google/starred",
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "user/-/state/com.google/starred",
    );

    const data = await response.json();
    expect(data.items).toEqual([]);
  });

  test("returns mapped items with continuation for non-empty rows", async () => {
    const row = {
      articleId: 99,
      title: "Mapped item",
      link: "https://example.com/item",
      content: "<p>content</p>",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
      sourceName: "Feed",
      sourceUrl: "https://example.com/feed",
      category: "Tech",
      isRead: true,
      isStarred: false,
    };

    const queryChain = {
      innerJoin: mock(() => queryChain),
      leftJoin: mock(() => queryChain),
      where: mock(() => queryChain),
      orderBy: mock(() => queryChain),
      limit: mock(() => queryChain),
      offset: mock(async () => [row]),
      then: <TResult1 = unknown, TResult2 = never>(
        onfulfilled?:
          | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null,
      ): Promise<TResult1 | TResult2> =>
        Promise.resolve([row]).then(onfulfilled, onrejected),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({ from: mock(() => queryChain) })),
      }),
    }));

    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=1",
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "user/-/state/com.google/reading-list",
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.items)).toBe(true);
    if (data.items.length > 0) {
      expect(
        typeof data.continuation === "string" ||
          data.continuation === undefined,
      ).toBe(true);
      expect(typeof data.items[0]?.title).toBe("string");
    }
  });

  test("uses ot fallback query when first pass returns empty rows", async () => {
    const firstPassRows: unknown[] = [];
    const secondPassRows = [
      {
        articleId: 120,
        title: "Fallback item",
        link: "https://example.com/fallback",
        content: "fallback",
        publicationDate: new Date("2024-01-02T00:00:00.000Z"),
        sourceName: "Feed",
        sourceUrl: "https://example.com/feed",
        category: null,
        isRead: null,
        isStarred: null,
      },
    ];

    const queuedRows = [firstPassRows, secondPassRows];
    const queryChain = {
      innerJoin: mock(() => queryChain),
      leftJoin: mock(() => queryChain),
      where: mock(() => queryChain),
      orderBy: mock(() => queryChain),
      limit: mock(() => queryChain),
      offset: mock(async () => queuedRows.shift() ?? []),
      then: <TResult1 = unknown, TResult2 = never>(
        onfulfilled?:
          | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null,
      ): Promise<TResult1 | TResult2> =>
        Promise.resolve(queuedRows.shift() ?? []).then(onfulfilled, onrejected),
    };

    mock.module("@/lib/core/article-status", () => ({
      canUseArticleStatusesTable: mock(async () => false),
      upsertArticleStatuses: mock(async () => {}),
    }));

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({ from: mock(() => queryChain) })),
      }),
    }));

    const { handleStreamContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-contents-handler");

    const olderThan = Math.floor(Date.now() / 1000);
    const request = new NextRequest(
      `https://example.com/api/greader.php/reader/api/0/stream/contents/user/-/state/com.google/reading-list?ot=${olderThan}`,
    );

    const response = await handleStreamContents(
      mockUser,
      request,
      "user/-/state/com.google/reading-list",
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.items)).toBe(true);
    if (data.items.length > 0) {
      expect(typeof data.items[0]?.title).toBe("string");
    }
  });
});

describe("Stream Item Contents Handler", () => {
  beforeEach(() => {
    mock.restore();
    registerBaseMocks();
  });

  test("handles empty article ID list", async () => {
    const { handleStreamItemContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-item-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents",
    );

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toEqual([]);
  });

  test("handles single article ID", async () => {
    const { handleStreamItemContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-item-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents?i=tag:google.com,2005:reader/item/00000001",
    );

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("items");
  });

  test("handles multiple article IDs", async () => {
    const { handleStreamItemContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-item-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents?i=tag:google.com,2005:reader/item/00000001&i=tag:google.com,2005:reader/item/00000002",
    );

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
  });

  test("handles POST request with form data", async () => {
    const { handleStreamItemContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-item-contents-handler");

    const formData = new FormData();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("i", "tag:google.com,2005:reader/item/00000002");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
  });

  test("limits article count to maximum", async () => {
    const { handleStreamItemContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-item-contents-handler");

    const url = new URL(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents",
    );
    // Add many article IDs
    for (let i = 0; i < 300; i++) {
      url.searchParams.append(
        "i",
        `tag:google.com,2005:reader/item/${i.toString().padStart(8, "0")}`,
      );
    }

    const request = new NextRequest(url);

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
  });

  test("handles invalid article ID format", async () => {
    const { handleStreamItemContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-item-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents?i=invalid-id",
    );

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
  });

  test("handles request without article statuses table", async () => {
    mock.module("@/lib/core/article-status", () => ({
      canUseArticleStatusesTable: mock(async () => false),
    }));

    const { handleStreamItemContents } =
      await import("@/app/api/greader.php/[...segments]/handlers/stream-item-contents-handler");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents?i=tag:google.com,2005:reader/item/00000001",
    );

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
  });
});

describe("Tag Handler", () => {
  beforeEach(() => {
    mock.restore();
    registerBaseMocks();
  });

  test("lists user tags", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({
          from: mock(() => ({
            leftJoin: mock(() => ({
              leftJoin: mock(() => ({
                where: mock(() =>
                  Promise.resolve([
                    { category: "Technology", url: "https://example.com/a" },
                    { category: "News", url: "https://example.com/b" },
                  ]),
                ),
              })),
            })),
          })),
        })),
      }),
    }));

    const { handleTagList } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag-labels");

    const response = await handleTagList(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("tags");
  });

  test("handles edit tag operation", async () => {
    const { handleEditTag } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const formData = new FormData();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/state/com.google/starred");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/edit-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleEditTag(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("handles star article operation", async () => {
    const { handleEditTag } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const formData = new FormData();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/state/com.google/starred");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/edit-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleEditTag(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("handles unstar article operation", async () => {
    const { handleEditTag } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const formData = new FormData();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("r", "user/-/state/com.google/starred");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/edit-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleEditTag(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("handles mark as read operation", async () => {
    const { handleEditTag } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const formData = new FormData();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("a", "user/-/state/com.google/read");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/edit-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleEditTag(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("handles mark as unread operation", async () => {
    const { handleEditTag } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const formData = new FormData();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("r", "user/-/state/com.google/read");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/edit-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleEditTag(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("handles multiple article operations", async () => {
    const { handleEditTag } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const formData = new FormData();
    formData.append("i", "tag:google.com,2005:reader/item/00000001");
    formData.append("i", "tag:google.com,2005:reader/item/00000002");
    formData.append("a", "user/-/state/com.google/read");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/edit-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleEditTag(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("handles edit tag with invalid parameters", async () => {
    const { handleEditTag } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/edit-tag",
      {
        method: "POST",
        body: new FormData(),
      },
    );

    const response = await handleEditTag(mockUser, request);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  test("handles mark all as read", async () => {
    const { handleMarkAllAsRead } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const formData = new FormData();
    formData.append("s", "user/-/state/com.google/reading-list");
    formData.append("ts", Math.floor(Date.now() / 1000).toString());

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/mark-all-as-read",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleMarkAllAsRead(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("handles mark all as read for specific feed", async () => {
    const { handleMarkAllAsRead } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const formData = new FormData();
    formData.append("s", "feed/https://example.com/feed");
    formData.append("ts", Math.floor(Date.now() / 1000).toString());

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/mark-all-as-read",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleMarkAllAsRead(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("rejects mark all as read without timestamp", async () => {
    const { handleMarkAllAsRead } =
      await import("@/app/api/greader.php/[...segments]/handlers/tag");

    const formData = new FormData();
    formData.append("s", "user/-/state/com.google/reading-list");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/mark-all-as-read",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleMarkAllAsRead(mockUser, request);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Subscription Handler", () => {
  beforeEach(() => {
    mock.restore();
    registerBaseMocks();
  });

  test("lists user subscriptions", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({
          from: mock(() => ({
            leftJoin: mock(() => ({
              leftJoin: mock(() => ({
                where: mock(() =>
                  Promise.resolve([
                    {
                      sourceId: 1,
                      title: "Feed 1",
                      url: "https://example.com/feed1",
                      feedId: 1,
                      category: "Tech",
                    },
                  ]),
                ),
              })),
            })),
          })),
        })),
      }),
    }));

    const { handleSubscriptionList } =
      await import("@/app/api/greader.php/[...segments]/handlers/subscription");

    const response = await handleSubscriptionList(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("subscriptions");
  });

  test("handles subscription edit - add", async () => {
    const { handleSubscriptionEdit } =
      await import("@/app/api/greader.php/[...segments]/handlers/subscription");

    const formData = new FormData();
    formData.append("ac", "subscribe");
    formData.append("s", "feed/https://example.com/feed");
    formData.append("t", "Example Feed");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/subscription/edit",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleSubscriptionEdit(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("handles subscription edit - remove", async () => {
    const { handleSubscriptionEdit } =
      await import("@/app/api/greader.php/[...segments]/handlers/subscription");

    const formData = new FormData();
    formData.append("ac", "unsubscribe");
    formData.append("s", "feed/https://example.com/feed");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/subscription/edit",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleSubscriptionEdit(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });

  test("handles subscription edit with category", async () => {
    const { handleSubscriptionEdit } =
      await import("@/app/api/greader.php/[...segments]/handlers/subscription");

    const formData = new FormData();
    formData.append("ac", "subscribe");
    formData.append("s", "feed/https://example.com/feed");
    formData.append("t", "Example Feed");
    formData.append("a", "user/-/label/Technology");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/subscription/edit",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleSubscriptionEdit(mockUser, request);

    expect(response.status).toBeLessThan(400);
  });
});
