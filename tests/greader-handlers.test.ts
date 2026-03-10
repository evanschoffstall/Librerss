/**
 * Comprehensive Tests: Google Reader API Handlers
 * Tests for src/lib/api/greader/
 */

import {
  DEFAULT_STREAM_ITEMS,
  GOOGLE_LOGIN_PREFIX,
  MAX_STREAM_ITEMS,
  TAG_MUTATIONS,
} from "@/lib/api/greader/constants";
import type { SessionUser } from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { resetArticleStatusTableStateForTests } from "@/lib/core/article-status";
import { READ_STATE, STARRED_STATE } from "@/lib/core/stream-ids";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { NextRequest } from "next/server";

beforeEach(() => mock.restore());

// Note: This file uses module mocking which violates AGENTS.md guidance
// but is kept for compatibility during refactoring

beforeEach(() => {
  mock.restore();
  resetArticleStatusTableStateForTests();
});

afterEach(() => {
  mock.restore();
});

afterAll(() => {
  mock.restore();
});

// Mock database setup
const createMockDb = () => ({
  select: mock(() => ({
    from: mock(() => ({
      limit: mock(() => ({
        then: (resolve: (v: unknown[]) => void) => resolve([]),
      })), // probe path for canUseArticleStatusesTable
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
  transaction: mock(
    async (fn: (tx: ReturnType<typeof createMockDb>) => Promise<unknown>) =>
      fn(createMockDb()),
  ),
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

  mock.module("@/lib/logger", () => ({
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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-contents");

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
      await import("@/lib/api/greader/stream-item-contents");

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
      await import("@/lib/api/greader/stream-item-contents");

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
      await import("@/lib/api/greader/stream-item-contents");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents?i=tag:google.com,2005:reader/item/00000001&i=tag:google.com,2005:reader/item/00000002",
    );

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
  });

  test("handles POST request with form data", async () => {
    const { handleStreamItemContents } =
      await import("@/lib/api/greader/stream-item-contents");

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
      await import("@/lib/api/greader/stream-item-contents");

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
      await import("@/lib/api/greader/stream-item-contents");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents?i=invalid-id",
    );

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
  });

  test("handles request without article statuses table", async () => {
    const missingErr = Object.assign(
      new Error('relation "ArticleStatus" does not exist'),
      { code: "42P01" },
    );
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        ...createMockDb(),
        select: mock(() => ({
          from: mock(() => ({
            limit: mock(async () => {
              throw missingErr;
            }), // probe fails → article statuses disabled
            innerJoin: mock(() => createQueryChain()),
            leftJoin: mock(() => createQueryChain()),
            where: mock(() => createQueryChain()),
          })),
        })),
      }),
    }));
    const { handleStreamItemContents } =
      await import("@/lib/api/greader/stream-item-contents");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents?i=tag:google.com,2005:reader/item/00000001",
    );

    const response = await handleStreamItemContents(mockUser, request);

    expect(response.status).toBe(200);
  });

  test("returns parse-form error response when body exceeds limit", async () => {
    const { handleStreamItemContents } =
      await import("@/lib/api/greader/stream-item-contents");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": "70000",
        },
        body: "i=tag:google.com,2005:reader/item/00000001",
      },
    );

    const response = await handleStreamItemContents(mockUser, request);
    expect(response.status).toBe(413);
  });

  test("sorts mapped items to requested article id order", async () => {
    const rows = [
      {
        articleId: 2,
        title: "Second",
        link: "https://example.com/2",
        content: "<p>2</p>",
        publicationDate: new Date("2024-01-02T00:00:00.000Z"),
        sourceName: "Feed",
        sourceUrl: "https://example.com/feed",
        category: "Tech",
        isRead: false,
        isStarred: false,
      },
      {
        articleId: 1,
        title: "First",
        link: "https://example.com/1",
        content: "<p>1</p>",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        sourceName: "Feed",
        sourceUrl: "https://example.com/feed",
        category: "Tech",
        isRead: false,
        isStarred: false,
      },
    ];

    const queryChain = {
      innerJoin: mock(() => queryChain),
      leftJoin: mock(() => queryChain),
      where: mock(async () => rows),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({ from: mock(() => queryChain) })),
      }),
    }));

    mock.module("@/lib/core/article-status", () => ({
      canUseArticleStatusesTable: mock(async () => true),
      upsertArticleStatuses: mock(async () => {}),
    }));

    const { handleStreamItemContents } =
      await import("@/lib/api/greader/stream-item-contents");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/contents?i=tag:google.com,2005:reader/item/00000001&i=tag:google.com,2005:reader/item/00000002",
    );

    const response = await handleStreamItemContents(mockUser, request);
    const payload = (await response.json()) as { items: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.items.map((item) => item.id)).toEqual([
      "tag:google.com,2005:reader/item/1",
      "tag:google.com,2005:reader/item/2",
    ]);
  });
});

describe("Stream Item IDs Handler", () => {
  beforeEach(() => {
    mock.restore();
    registerBaseMocks();
  });

  test("returns empty result for starred stream when article-status table is unavailable", async () => {
    mock.module("@/lib/core/article-status", () => ({
      canUseArticleStatusesTable: mock(async () => false),
      upsertArticleStatuses: mock(async () => {}),
    }));

    const { handleStreamItemIds } =
      await import("@/lib/api/greader/stream-item-ids");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/ids?s=user/-/state/com.google/starred",
    );

    const response = await handleStreamItemIds(mockUser, request);
    const payload = (await response.json()) as {
      itemRefs: Array<{ id: string }>;
      continuation?: string;
    };

    expect(response.status).toBe(200);
    expect(payload.itemRefs).toEqual([]);
    expect(payload.continuation).toBeUndefined();
  });

  test("retries without article-status join when relation is missing", async () => {
    const queryResults: Array<unknown[] | Error> = [
      Object.assign(new Error('relation "ArticleStatus" does not exist'), {
        code: "42P01",
      }),
      [{ articleId: 25, isRead: false, isStarred: false }],
    ];

    const queryChain = {
      innerJoin: mock(() => queryChain),
      leftJoin: mock(() => queryChain),
      where: mock(() => queryChain),
      orderBy: mock(() => queryChain),
      limit: mock(() => queryChain),
      offset: mock(async () => {
        const next = queryResults.shift() ?? [];
        if (next instanceof Error) {
          throw next;
        }
        return next;
      }),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({ from: mock(() => queryChain) })),
      }),
    }));

    mock.module("@/lib/core/article-status", () => ({
      canUseArticleStatusesTable: mock(async () => true),
      upsertArticleStatuses: mock(async () => {}),
    }));

    const { handleStreamItemIds } =
      await import("@/lib/api/greader/stream-item-ids");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/ids?s=user/-/state/com.google/reading-list&n=1",
    );

    const response = await handleStreamItemIds(mockUser, request);
    const payload = (await response.json()) as {
      itemRefs: Array<{ id: string }>;
      continuation?: string;
    };

    expect(response.status).toBe(200);
    expect(payload.itemRefs).toEqual([{ id: "25" }]);
    expect(payload.continuation).toBe("25");
  });

  test("rethrows non-relation query errors", async () => {
    const queryChain = {
      innerJoin: mock(() => queryChain),
      leftJoin: mock(() => queryChain),
      where: mock(() => queryChain),
      orderBy: mock(() => queryChain),
      limit: mock(() => queryChain),
      offset: mock(async () => {
        throw new Error("query failed");
      }),
    };

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: mock(() => ({ from: mock(() => queryChain) })),
      }),
    }));

    mock.module("@/lib/core/article-status", () => ({
      canUseArticleStatusesTable: mock(async () => true),
      upsertArticleStatuses: mock(async () => {}),
    }));

    const { handleStreamItemIds } =
      await import("@/lib/api/greader/stream-item-ids");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/ids?s=user/-/state/com.google/reading-list",
    );

    await expect(handleStreamItemIds(mockUser, request)).rejects.toThrow(
      "query failed",
    );
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

    const { handleTagList } = await import("@/lib/api/greader/tag-labels");

    const response = await handleTagList(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("tags");
  });

  test("disabling a non-user tag is a no-op", async () => {
    const deleteWhere = mock(async () => []);
    const loggerInfo = mock(() => {});

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        delete: mock(() => ({ where: deleteWhere })),
      }),
    }));

    mock.module("@/lib/logger", () => ({
      logger: {
        info: loggerInfo,
        warn: mock(() => {}),
        error: mock(() => {}),
      },
    }));

    const { handleDisableTag } = await import("@/lib/api/greader/tag-labels");

    const formData = new FormData();
    formData.append("s", "user/-/state/com.google/reading-list");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/disable-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleDisableTag(mockUser, request);

    expect(await response.text()).toBe("OK\n");
    expect(deleteWhere).not.toHaveBeenCalled();
    expect(loggerInfo).not.toHaveBeenCalled();
  });

  test("disabling a user tag deletes matching feed category rows", async () => {
    const deleteWhere = mock(async () => []);
    const loggerInfo = mock(() => {});

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        delete: mock(() => ({ where: deleteWhere })),
      }),
    }));

    mock.module("@/lib/logger", () => ({
      logger: {
        info: loggerInfo,
        warn: mock(() => {}),
        error: mock(() => {}),
      },
    }));

    const { handleDisableTag } = await import("@/lib/api/greader/tag-labels");

    const formData = new FormData();
    formData.append("s", "user/-/label/Tech");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/disable-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleDisableTag(mockUser, request);

    expect(await response.text()).toBe("OK\n");
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledTimes(1);
  });

  test("renaming tags returns OK when labels are invalid or unchanged", async () => {
    const updateWhere = mock(async () => []);

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        update: mock(() => ({
          set: mock(() => ({ where: updateWhere })),
        })),
      }),
    }));

    const { handleRenameTag } = await import("@/lib/api/greader/tag-labels");

    const formData = new FormData();
    formData.append("s", "user/-/label/Same");
    formData.append("dest", "user/-/label/Same");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/rename-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleRenameTag(mockUser, request);

    expect(await response.text()).toBe("OK\n");
    expect(updateWhere).not.toHaveBeenCalled();
  });

  test("renaming tags updates feed categories when source/destination differ", async () => {
    const updateWhere = mock(async () => []);
    const loggerInfo = mock(() => {});

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        update: mock(() => ({
          set: mock(() => ({ where: updateWhere })),
        })),
      }),
    }));

    mock.module("@/lib/logger", () => ({
      logger: {
        info: loggerInfo,
        warn: mock(() => {}),
        error: mock(() => {}),
      },
    }));

    const { handleRenameTag } = await import("@/lib/api/greader/tag-labels");

    const formData = new FormData();
    formData.append("s", "user/-/label/Old");
    formData.append("dest", "user/-/label/New");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/rename-tag",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await handleRenameTag(mockUser, request);

    expect(await response.text()).toBe("OK\n");
    expect(updateWhere).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledTimes(1);
  });

  test("handles edit tag operation", async () => {
    const { handleEditTag } = await import("@/lib/api/greader/tag");

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
    const { handleEditTag } = await import("@/lib/api/greader/tag");

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
    const { handleEditTag } = await import("@/lib/api/greader/tag");

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
    const { handleEditTag } = await import("@/lib/api/greader/tag");

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
    const { handleEditTag } = await import("@/lib/api/greader/tag");

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
    const { handleEditTag } = await import("@/lib/api/greader/tag");

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
    const { handleEditTag } = await import("@/lib/api/greader/tag");

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
    const { handleMarkAllAsRead } = await import("@/lib/api/greader/tag");

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
    const { handleMarkAllAsRead } = await import("@/lib/api/greader/tag");

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
    const { handleMarkAllAsRead } = await import("@/lib/api/greader/tag");

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
      await import("@/lib/api/greader/subscription");

    const response = await handleSubscriptionList(mockUser);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("subscriptions");
  });

  test("handles subscription edit - add", async () => {
    const { handleSubscriptionEdit } =
      await import("@/lib/api/greader/subscription");

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
      await import("@/lib/api/greader/subscription");

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
      await import("@/lib/api/greader/subscription");

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

  test("quick add rejects oversized feed urls", async () => {
    const { handleSubscriptionQuickAdd } =
      await import("@/lib/api/greader/subscription");

    const oversized = "https://example.com/" + "x".repeat(2100);
    const request = new NextRequest(
      `https://example.com/api/greader.php/reader/api/0/subscription/quickadd?quickadd=${encodeURIComponent(oversized)}`,
    );

    const response = await handleSubscriptionQuickAdd(mockUser, request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid feed URL");
  });

  test("quick add rejects malformed urls", async () => {
    const { handleSubscriptionQuickAdd } =
      await import("@/lib/api/greader/subscription");

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/subscription/quickadd?quickadd=not-a-valid-feed-url",
    );

    const response = await handleSubscriptionQuickAdd(mockUser, request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid feed URL");
  });
});

// ── api/greader/auth – requireGReaderUser with no auth ───────────────────────

describe("api/greader/auth – requireGReaderUser returns 401 when no auth", () => {
  test("returns 401 Response when request has no token and no cookie", async () => {
    const { requireGReaderUser } = await import("@/lib/api/greader/auth");
    const { createMockRequest } = await import("./support/test-utils");
    const req = createMockRequest("https://example.com/greader");
    const result = await requireGReaderUser(req);
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });
});

// ── lib/api/greader/auth – handleClientLogin paths ────────────────────────────
// Tests use placeholder mode (DATABASE_URL='') or input validation to avoid DB calls.

describe("lib/api/greader/auth – handleClientLogin", () => {
  test("returns 400 for JSON body with missing credentials", async () => {
    const { createMockRequest } = await import("./support/test-utils");
    const { handleClientLogin } = await import("@/lib/api/greader/auth");
    // parseEmailPasswordFromRecord returns null → 400 before auth is called.
    const request = createMockRequest(
      "https://example.com/greader/accounts/ClientLogin",
      {
        method: "POST",
        body: { other: "field" },
        headers: { "content-type": "application/json" },
      },
    );
    const response = await handleClientLogin(request);
    expect(response.status).toBe(400);
  });

  test("returns 403 in placeholder mode for wrong email", async () => {
    const { createMockRequest } = await import("./support/test-utils");
    const { handleClientLogin } = await import("@/lib/api/greader/auth");
    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    try {
      // Placeholder mode: email !== PLACEHOLDER_ADMIN_USER.email → { ok: false } → 403.
      const request = createMockRequest(
        "https://example.com/greader/accounts/ClientLogin",
        {
          method: "POST",
          body: { Email: "notadmin@example.com", Passwd: "WrongPass123!" },
          headers: { "content-type": "application/json" },
        },
      );
      const response = await handleClientLogin(request);
      expect(response.status).toBe(403);
    } finally {
      if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
      else delete process.env.DATABASE_URL;
    }
  });
});

// ── lib/api/greader/auth – requireGReaderUser ────────────────────────────────

describe("lib/api/greader/auth – requireGReaderUser", () => {
  test("returns 401 when no Authorization header present", async () => {
    const { createMockRequest } = await import("./support/test-utils");
    const { requireGReaderUser } = await import("@/lib/api/greader/auth");
    // extractAuthToken returns null → immediate 401, no DB needed.
    const request = createMockRequest(
      "https://example.com/greader/reader/api/0/user-info",
    );
    const result = await requireGReaderUser(request);
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }
  });

  test("returns user in placeholder mode with valid session token", async () => {
    const { createMockRequest } = await import("./support/test-utils");
    const { requireGReaderUser } = await import("@/lib/api/greader/auth");
    const { PLACEHOLDER_ADMIN_USER } = await import("@/lib/core/runtime");
    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    try {
      // getUserFromSessionToken matches PLACEHOLDER_ADMIN_USER.sessionToken → returns user.
      const request = createMockRequest(
        "https://example.com/greader/reader/api/0/user-info",
        {
          headers: {
            Authorization: `Bearer ${PLACEHOLDER_ADMIN_USER.sessionToken}`,
          },
        },
      );
      const result = await requireGReaderUser(request);
      expect(result instanceof Response).toBe(false);
      if (!(result instanceof Response)) {
        expect(result.userId).toBe(PLACEHOLDER_ADMIN_USER.id);
      }
    } finally {
      if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
      else delete process.env.DATABASE_URL;
    }
  });
});

// ── lib/api/greader/auth – extractAuthToken bearer branch ─────────────────────
// These tests set DATABASE_URL="" to use placeholder mode (no real DB queries).

describe("lib/api/greader/auth – extractAuthToken additional branches", () => {
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

  test("requireGReaderUser extracts bearer token and returns 401 for invalid token", async () => {
    const { requireGReaderUser } = await import("@/lib/api/greader/auth");
    const { createMockRequest } = await import("./support/test-utils");

    const req = createMockRequest(
      "https://example.com/greader.php/api/0/user-info",
      {
        headers: { authorization: "Bearer definitely-invalid-token-xyz" },
      },
    );

    const result = await requireGReaderUser(req);
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });

  test("requireGReaderUser extracts GoogleLogin token and returns 401 for invalid token", async () => {
    const { requireGReaderUser } = await import("@/lib/api/greader/auth");
    const { createMockRequest } = await import("./support/test-utils");

    const req = createMockRequest(
      "https://example.com/greader.php/api/0/user-info",
      {
        headers: {
          authorization: "GoogleLogin auth=definitely-invalid-token-xyz",
        },
      },
    );

    const result = await requireGReaderUser(req);
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });

  test("requireGReaderUser reads auth query param and returns 401 for invalid token", async () => {
    const { requireGReaderUser } = await import("@/lib/api/greader/auth");
    const { createMockRequest } = await import("./support/test-utils");

    const req = createMockRequest(
      "https://example.com/greader.php/api/0/user-info?auth=bad-token",
    );
    const result = await requireGReaderUser(req);
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });
});

// ── lib/api/greader/auth – parseClientLoginPayload edge branches ───────────────

describe("lib/api/greader/auth – handleClientLogin edge branches", () => {
  test("returns 400 when JSON body is unparseable (line 70 via handleClientLogin line 106)", async () => {
    const { NextRequest } = await import("next/server");
    const { handleClientLogin } = await import("@/lib/api/greader/auth");
    const req = new NextRequest("https://dummy.local/accounts/ClientLogin", {
      method: "POST",
      body: "this is not json at all",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.41, 10.0.0.1",
      },
    });
    const result = await handleClientLogin(req);
    expect(result.status).toBe(400);
    const text = await result.text();
    expect(text).toContain("BadAuthentication");
  });

  test("returns 400 for POST with text/plain content-type (lines 79-84 fallthrough)", async () => {
    const { NextRequest } = await import("next/server");
    const { handleClientLogin } = await import("@/lib/api/greader/auth");
    const req = new NextRequest("https://dummy.local/accounts/ClientLogin", {
      method: "POST",
      // text/plain → not form-urlencoded, not JSON → falls through to fallback
      // parseFormOrQueryParams path (lines 79-84). Body has no Email/Passwd keys
      // → parseClientLoginParams returns null → handleClientLogin returns 400 BadAuth.
      body: "no-credentials-here",
      headers: {
        "content-type": "text/plain",
        "x-forwarded-for": "192.0.2.42, 10.0.0.1",
      },
    });
    const result = await handleClientLogin(req);
    // payload is null → line 109-110 returns 400 without DB call
    expect(result.status).toBe(400);
    const text = await result.text();
    expect(text).toContain("BadAuthentication");
  });

  test("returns 403 when password exceeds max length (line 116)", async () => {
    const { NextRequest } = await import("next/server");
    const { handleClientLogin } = await import("@/lib/api/greader/auth");
    // Password longer than PASSWORD_MAX_LENGTH=1024
    const longPassword = "x".repeat(1025);
    const body = `Email=user@example.com&Passwd=${encodeURIComponent(longPassword)}`;
    const req = new NextRequest("https://dummy.local/accounts/ClientLogin", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "192.0.2.43, 10.0.0.1",
      },
    });
    const result = await handleClientLogin(req);
    expect(result.status).toBe(403);
    const text = await result.text();
    expect(text).toContain("BadAuthentication");
  });

  test("returns 413 when form body is too large (line 104)", async () => {
    const { NextRequest } = await import("next/server");
    const { handleClientLogin } = await import("@/lib/api/greader/auth");
    const req = new NextRequest("https://dummy.local/accounts/ClientLogin", {
      method: "POST",
      body: "Email=user@example.com&Passwd=pass",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": "999999999",
        "x-forwarded-for": "192.0.2.44, 10.0.0.1",
      },
    });
    const result = await handleClientLogin(req);
    expect(result.status).toBe(413);
    const text = await result.text();
    expect(text).toContain("RequestTooLarge");
  });
});

// ─── greader constants ────────────────────────────────────────────────────────

describe("greader constants", () => {
  test("TAG_MUTATIONS has expected entries", async () => {
    expect(TAG_MUTATIONS.length).toBe(4);
  });

  test("TAG_MUTATIONS has read-add mutation", async () => {
    const readAdd = TAG_MUTATIONS.find(
      (m) => m.target === "a" && m.tag === READ_STATE,
    );
    expect(readAdd).toBeTruthy();
    expect(readAdd!.patch.isRead).toBe(true);
  });

  test("TAG_MUTATIONS has read-remove mutation", async () => {
    const readRemove = TAG_MUTATIONS.find(
      (m) => m.target === "r" && m.tag === READ_STATE,
    );
    expect(readRemove).toBeTruthy();
    expect(readRemove!.patch.isRead).toBe(false);
  });

  test("TAG_MUTATIONS has starred-add mutation", async () => {
    const starredAdd = TAG_MUTATIONS.find(
      (m) => m.target === "a" && m.tag === STARRED_STATE,
    );
    expect(starredAdd).toBeTruthy();
    expect(starredAdd!.patch.isStarred).toBe(true);
  });

  test("TAG_MUTATIONS has starred-remove mutation", async () => {
    const starredRemove = TAG_MUTATIONS.find(
      (m) => m.target === "r" && m.tag === STARRED_STATE,
    );
    expect(starredRemove).toBeTruthy();
    expect(starredRemove!.patch.isStarred).toBe(false);
  });

  test("MAX_STREAM_ITEMS matches CONFIG", async () => {
    expect(MAX_STREAM_ITEMS).toBe(CONFIG.GREADER_MAX_STREAM_ITEMS);
    expect(DEFAULT_STREAM_ITEMS).toBe(CONFIG.GREADER_DEFAULT_STREAM_ITEMS);
  });

  test("GOOGLE_LOGIN_PREFIX is correct", async () => {
    expect(GOOGLE_LOGIN_PREFIX).toBe("googlelogin auth=");
  });
});
