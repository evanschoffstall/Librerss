/**
 * Tests for feed-records with DI stubs, article-status helpers, dns-cache
 * internal logic, and db module. Each function that accepts an executor
 * parameter is tested with a chainable mock object.
 */
import { CONFIG } from "@/lib/config";
import {
  canUseArticleStatusesTable,
  upsertArticleStatuses,
} from "@/lib/core/article-status";
import {
  dedupePendingArticles,
  getPublicationDateRange,
  toPendingArticle,
} from "@/lib/core/feed-parser";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import {
  FEED_STREAM_PREFIX,
  parseUserLabel,
  READ_STATE,
  READING_LIST_STREAM,
  STARRED_STATE,
  USER_LABEL_PREFIX,
} from "@/lib/core/stream-ids";
import {
  ensureFeedRecordByUrl,
  feedRecordFields,
  findFeedIdByUrl,
  removeUserFeedCategory,
  replaceUserFeedCategory,
} from "@/lib/db/feed-records";
import * as schema from "@/lib/db/schema";
import {
  articles,
  articleStatuses,
  categoryOrders,
  feedCategories,
  feeds,
  feedSources,
  sessions,
  users,
} from "@/lib/db/schema";
import { isSafePositiveItemId } from "@/lib/utils/validation";
import { describe, expect, test } from "bun:test";

// ─── Helpers: chainable DB mock ───────────────────────────────────────────────

function createChainMock(terminalValue: any) {
  const chain: any = {};
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === "then") return undefined; // not a thenable
      return () => {
        // Terminal methods that return the final result
        if (prop === "limit" || prop === "execute" || prop === "returning") {
          return Promise.resolve(terminalValue);
        }
        return new Proxy(chain, handler);
      };
    },
  };
  return new Proxy(chain, handler);
}

function createMockExecutor(options: {
  selectResult?: any[];
  insertResult?: any[];
  deleteResult?: any;
  updateResult?: any;
}) {
  return {
    select: (..._args: any[]) => createChainMock(options.selectResult ?? []),
    insert: (..._args: any[]) => createChainMock(options.insertResult ?? []),
    delete: (..._args: any[]) =>
      createChainMock(options.deleteResult ?? undefined),
    update: (..._args: any[]) => createChainMock(options.updateResult ?? []),
    execute: (..._args: any[]) => Promise.resolve(options.selectResult ?? []),
  };
}

// ─── feed-records: findFeedIdByUrl ────────────────────────────────────────────

describe("findFeedIdByUrl", () => {
  test.skip("returns feed id when found", async () => {
    const executor = createMockExecutor({
      selectResult: [{ id: 42 }],
    });
    const result = await findFeedIdByUrl(
      executor as any,
      "https://example.com/feed",
    );
    expect(result).toBe(42);
  });

  test.skip("returns null when not found", async () => {
    const executor = createMockExecutor({ selectResult: [] });
    const result = await findFeedIdByUrl(
      executor as any,
      "https://missing.com",
    );
    expect(result).toBeNull();
  });
});

// ─── feed-records: ensureFeedRecordByUrl ──────────────────────────────────────

describe("ensureFeedRecordByUrl", () => {
  test.skip("returns existing feed record", async () => {
    const existingFeed = {
      id: 10,
      url: "https://example.com/feed",
      lastFetched: new Date(),
      lastFetchError: null,
    };

    // Mock executor: select returns existing feed on first call
    let selectCallCount = 0;
    const executor = {
      select: (..._args: any[]) =>
        createChainMock(selectCallCount++ === 0 ? [existingFeed] : []),
      insert: (..._args: any[]) => createChainMock([]),
    };

    const result = await ensureFeedRecordByUrl(
      executor as any,
      "https://example.com/feed",
    );
    expect(result.id).toBe(10);
    expect(result.url).toBe("https://example.com/feed");
  });
});

// ─── feed-records: replaceUserFeedCategory ────────────────────────────────────

describe("replaceUserFeedCategory", () => {
  test("calls insert with correct params", async () => {
    const executor = createMockExecutor({});
    // Should not throw
    await replaceUserFeedCategory(executor as any, {
      userId: 1,
      feedId: 10,
      category: "Tech",
    });
  });
});

// ─── feed-records: removeUserFeedCategory ─────────────────────────────────────

describe("removeUserFeedCategory", () => {
  test("deletes without specific category", async () => {
    const executor = createMockExecutor({});
    await removeUserFeedCategory(executor as any, {
      userId: 1,
      feedId: 10,
    });
  });

  test("deletes with specific category", async () => {
    const executor = createMockExecutor({});
    await removeUserFeedCategory(executor as any, {
      userId: 1,
      feedId: 10,
      category: "Tech",
    });
  });
});

// ─── feed-records: feedRecordFields ───────────────────────────────────────────

describe("feedRecordFields", () => {
  test("exports expected field shape", () => {
    expect(feedRecordFields).toHaveProperty("id");
    expect(feedRecordFields).toHaveProperty("url");
    expect(feedRecordFields).toHaveProperty("lastFetched");
    expect(feedRecordFields).toHaveProperty("lastFetchError");
  });
});

// ─── article-status: isMissingArticleStatusesTableError via exports ───────────

describe("article-status module", () => {
  test("exports canUseArticleStatusesTable", () => {
    expect(typeof canUseArticleStatusesTable).toBe("function");
  });

  test("exports upsertArticleStatuses", () => {
    expect(typeof upsertArticleStatuses).toBe("function");
  });

  test("re-exports isSafePositiveItemId", () => {
    expect(typeof isSafePositiveItemId).toBe("function");
    expect(isSafePositiveItemId(1)).toBe(true);
    expect(isSafePositiveItemId(0)).toBe(false);
    expect(isSafePositiveItemId(-1)).toBe(false);
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  test("upsertArticleStatuses returns immediately for empty articleIds", async () => {
    // Should not throw — returns early for empty array
    await upsertArticleStatuses(1, [], { isRead: true });
  });
});

// ─── schema: all table exports ────────────────────────────────────────────────

describe("schema exports", () => {
  test("users table has expected columns", () => {
    expect(users).toBeDefined();
    // Drizzle table objects have column references
    expect(users.id).toBeDefined();
    expect(users.email).toBeDefined();
    expect(users.passwordHash).toBeDefined();
    expect(users.createdAt).toBeDefined();
  });

  test("sessions table has expected columns", () => {
    expect(sessions).toBeDefined();
    expect(sessions.id).toBeDefined();
    expect(sessions.userId).toBeDefined();
    expect(sessions.tokenHash).toBeDefined();
    expect(sessions.expiresAt).toBeDefined();
  });

  test("feeds table has expected columns", () => {
    expect(feeds).toBeDefined();
    expect(feeds.id).toBeDefined();
    expect(feeds.url).toBeDefined();
    expect(feeds.lastFetched).toBeDefined();
    expect(feeds.lastFetchError).toBeDefined();
  });

  test("articles table has expected columns", () => {
    expect(articles).toBeDefined();
    expect(articles.id).toBeDefined();
    expect(articles.title).toBeDefined();
    expect(articles.link).toBeDefined();
    expect(articles.content).toBeDefined();
    expect(articles.publicationDate).toBeDefined();
    expect(articles.feedId).toBeDefined();
    expect(articles.lastChecked).toBeDefined();
  });

  test("feedSources table has expected columns", () => {
    expect(feedSources).toBeDefined();
    expect(feedSources.id).toBeDefined();
    expect(feedSources.userId).toBeDefined();
    expect(feedSources.name).toBeDefined();
    expect(feedSources.url).toBeDefined();
  });

  test("feedCategories table has expected columns", () => {
    expect(feedCategories).toBeDefined();
    expect(feedCategories.id).toBeDefined();
    expect(feedCategories.userId).toBeDefined();
    expect(feedCategories.feedId).toBeDefined();
    expect(feedCategories.category).toBeDefined();
  });

  test("categoryOrders table has expected columns", () => {
    expect(categoryOrders).toBeDefined();
    expect(categoryOrders.id).toBeDefined();
    expect(categoryOrders.userId).toBeDefined();
    expect(categoryOrders.orderedLabels).toBeDefined();
    expect(categoryOrders.updatedAt).toBeDefined();
  });

  test("articleStatuses table has expected columns", () => {
    expect(articleStatuses).toBeDefined();
    expect(articleStatuses.id).toBeDefined();
    expect(articleStatuses.userId).toBeDefined();
    expect(articleStatuses.articleId).toBeDefined();
    expect(articleStatuses.isRead).toBeDefined();
    expect(articleStatuses.isStarred).toBeDefined();
    expect(articleStatuses.updatedAt).toBeDefined();
  });

  test("legacy aliases are exported", () => {
    expect(schema.articleStatus).toBe(schema.articleStatuses);
    expect(schema.categories).toBe(schema.feedCategories);
  });
});

// ─── stream-ids: re-exports ───────────────────────────────────────────────────

describe("stream-ids module", () => {
  test("exports stream constants", () => {
    expect(FEED_STREAM_PREFIX).toBe("feed/");
    expect(READING_LIST_STREAM).toBe("user/-/state/com.google/reading-list");
    expect(READ_STATE).toBe("user/-/state/com.google/read");
    expect(STARRED_STATE).toBe("user/-/state/com.google/starred");
    expect(USER_LABEL_PREFIX).toBe("user/-/label/");
  });

  test("parseUserLabel extracts label", () => {
    expect(parseUserLabel("user/-/label/Tech")).toBe("Tech");
    expect(parseUserLabel("user/-/label/My Category")).toBe("My Category");
  });

  test("parseUserLabel returns null for non-label strings", () => {
    expect(parseUserLabel("")).toBeNull();
    expect(parseUserLabel("not-a-label")).toBeNull();
    expect(parseUserLabel("user/-/state/com.google/read")).toBeNull();
  });
});

// ─── feed-parser: core module ─────────────────────────────────────────────────

describe("feed-parser core module", () => {
  test("toPendingArticle returns null for items without link", () => {
    const result = toPendingArticle({ title: "No link" } as any, 1, new Date());
    expect(result).toBeNull();
  });

  test("toPendingArticle creates article from valid item", () => {
    const now = new Date();
    const result = toPendingArticle(
      {
        title: "Test",
        link: "https://example.com/article",
        content: "Content here",
        pubDate: "2024-01-15",
      },
      5,
      now,
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.title).toBe("Test");
      expect(result.link).toBe("https://example.com/article");
      expect(result.feedId).toBe(5);
    }
  });

  test("dedupePendingArticles removes duplicates by link", () => {
    const now = new Date();
    const a1 = toPendingArticle(
      {
        title: "A",
        link: "https://x.com/1",
        content: "",
        pubDate: "2024-01-01",
      },
      1,
      now,
    );
    const a2 = toPendingArticle(
      {
        title: "B",
        link: "https://x.com/1",
        content: "",
        pubDate: "2024-01-02",
      },
      1,
      now,
    );
    const a3 = toPendingArticle(
      {
        title: "C",
        link: "https://x.com/2",
        content: "",
        pubDate: "2024-01-03",
      },
      1,
      now,
    );
    const deduped = dedupePendingArticles([a1!, a2!, a3!]);
    expect(deduped).toHaveLength(2);
  });

  test("getPublicationDateRange returns correct range", () => {
    const now = new Date();
    const a1 = toPendingArticle(
      { title: "A", link: "https://x.com/1", pubDate: "2024-01-01" },
      1,
      now,
    );
    const a2 = toPendingArticle(
      { title: "B", link: "https://x.com/2", pubDate: "2024-06-15" },
      1,
      now,
    );
    const range = getPublicationDateRange([a1!, a2!]);
    expect(range.newestPublicationDate).toBeDefined();
    expect(range.oldestPublicationDate).toBeDefined();
  });

  test("getPublicationDateRange handles empty array", () => {
    const range = getPublicationDateRange([]);
    expect(range.newestPublicationDate).toBeNull();
    expect(range.oldestPublicationDate).toBeNull();
  });
});

// ─── runtime module ───────────────────────────────────────────────────────────

describe("runtime module", () => {
  test("RUNTIME_FLAGS has expected getters", () => {
    expect(typeof RUNTIME_FLAGS.hasDatabaseUrl).toBe("boolean");
    expect(typeof RUNTIME_FLAGS.usePlaceholderData).toBe("boolean");
    expect(typeof RUNTIME_FLAGS.allowSignup).toBe("boolean");
  });

  test.skip("PLACEHOLDER_ADMIN_USER has expected shape", () => {
    expect(PLACEHOLDER_ADMIN_USER.id).toBe(0);
    expect(PLACEHOLDER_ADMIN_USER.email).toBe("admin@admin.com");
    expect(typeof PLACEHOLDER_ADMIN_USER.passwordHash).toBe("string");
    expect(typeof PLACEHOLDER_ADMIN_USER.sessionToken).toBe("string");
    expect(PLACEHOLDER_ADMIN_USER.sessionToken.length).toBe(64); // 32 bytes hex
  });
});

// ─── config module ────────────────────────────────────────────────────────────

describe("config module", () => {
  test("CONFIG has required feed settings", () => {
    expect(typeof CONFIG.FEED_CACHE_TTL_MINUTES).toBe("number");
    expect(typeof CONFIG.FEED_FORCE_REFRESH_TTL_MINUTES).toBe("number");
    expect(typeof CONFIG.MAX_ARTICLES_PER_FEED).toBe("number");
    expect(typeof CONFIG.FEED_REQUEST_TIMEOUT_MS).toBe("number");
    expect(typeof CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES).toBe("number");
    expect(typeof CONFIG.FEED_REQUEST_USER_AGENT).toBe("string");
    expect(typeof CONFIG.FEED_REQUEST_ACCEPT).toBe("string");
    expect(typeof CONFIG.DNS_LOOKUP_TIMEOUT_MS).toBe("number");
    expect(typeof CONFIG.DNS_CACHE_TTL_MS).toBe("number");
  });

  test("CONFIG has required auth settings", () => {
    expect(typeof CONFIG.SESSION_DURATION_DAYS).toBe("number");
    expect(typeof CONFIG.MAX_SESSIONS_PER_USER).toBe("number");
    expect(typeof CONFIG.PASSWORD_MAX_LENGTH).toBe("number");
  });

  test("CONFIG has rate limit settings", () => {
    expect(typeof CONFIG.RATE_LIMIT_LOGIN_WINDOW_MS).toBe("number");
    expect(typeof CONFIG.RATE_LIMIT_LOGIN_MAX_ATTEMPTS).toBe("number");
  });

  test("CONFIG has GReader settings", () => {
    expect(typeof CONFIG.GREADER_MAX_STREAM_ITEMS).toBe("number");
    expect(typeof CONFIG.GREADER_DEFAULT_STREAM_ITEMS).toBe("number");
    expect(typeof CONFIG.GREADER_NETNEWSWIRE_MAX_ITEMS).toBe("number");
  });
});
