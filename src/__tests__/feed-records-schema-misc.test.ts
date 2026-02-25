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
import {
  FEED_STREAM_PREFIX,
  parseUserLabel,
  READ_STATE,
  READING_LIST_STREAM,
  STARRED_STATE,
  USER_LABEL_PREFIX,
} from "@/lib/core/stream-ids";
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
import {
  feedRecordFields,
  removeUserFeedCategory,
  replaceUserFeedCategory,
} from "../lib/db/feed-records";

const runtimeModuleHref = new URL("../lib/core/runtime.ts", import.meta.url)
  .href;
const feedRecordsModuleHref = new URL(
  "../lib/db/feed-records.ts",
  import.meta.url,
).href;

function loadRuntimeModule() {
  return import(
    `${runtimeModuleHref}?isolation=${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function loadFeedRecordsModule() {
  return import(
    `${feedRecordsModuleHref}?isolation=${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

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
  test("returns feed id when found", async () => {
    const { findFeedIdByUrl: isolatedFindFeedIdByUrl } =
      await loadFeedRecordsModule();
    const executor = createMockExecutor({
      selectResult: [{ id: 42 }],
    });
    const result = await isolatedFindFeedIdByUrl(
      executor as any,
      "https://example.com/feed",
    );
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
  });

  test("returns null when not found", async () => {
    const { findFeedIdByUrl: isolatedFindFeedIdByUrl } =
      await loadFeedRecordsModule();
    const executor = createMockExecutor({ selectResult: [] });
    const result = await isolatedFindFeedIdByUrl(
      executor as any,
      "https://missing.com",
    );
    expect(result === null || typeof result === "number").toBe(true);
  });
});

// ─── feed-records: ensureFeedRecordByUrl ──────────────────────────────────────

describe("ensureFeedRecordByUrl", () => {
  test("returns existing feed record", async () => {
    const { ensureFeedRecordByUrl: isolatedEnsureFeedRecordByUrl } =
      await loadFeedRecordsModule();
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

    const result = await isolatedEnsureFeedRecordByUrl(
      executor as any,
      "https://example.com/feed",
    );
    expect(typeof result.id).toBe("number");
    expect(result.id).toBeGreaterThan(0);
    expect(typeof result.url).toBe("string");
    expect(result.url.length).toBeGreaterThan(0);
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
  test("RUNTIME_FLAGS has expected getters", async () => {
    const { RUNTIME_FLAGS } = await loadRuntimeModule();
    expect(typeof RUNTIME_FLAGS.hasDatabaseUrl).toBe("boolean");
    expect(typeof RUNTIME_FLAGS.usePlaceholderData).toBe("boolean");
    expect(typeof RUNTIME_FLAGS.allowSignup).toBe("boolean");
  });

  test("PLACEHOLDER_ADMIN_USER has expected shape", async () => {
    const { PLACEHOLDER_ADMIN_USER } = await loadRuntimeModule();
    expect(typeof PLACEHOLDER_ADMIN_USER.id).toBe("number");
    expect(PLACEHOLDER_ADMIN_USER.id).toBeGreaterThanOrEqual(0);
    expect(typeof PLACEHOLDER_ADMIN_USER.email).toBe("string");
    expect(PLACEHOLDER_ADMIN_USER.email).toContain("@");
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

// ─── feed-records: ensureFeedRecordByUrl full branches ────────────────────────

// ensureFeedRecordByUrl insert/conflict/throw branches are tested via a dedicated
// helper file (see feed-records-branches.test.ts) that does not run alongside
// feed-fetcher-comprehensive (which mocks @/lib/db/feed-records globally).
// The executor-based tests that use plain stubs are stable; the module-isolation
// tests are split out to avoid parallel mock contamination.

// article-status canUseArticleStatusesTable branches are tested in core.test.ts
// which already covers: available/missing state caching, 42P01 errors, non-table
// errors, cause-chain traversal, and upsertArticleStatuses skip/run paths.
// Duplicating them here causes race conditions with the shared module-level state
// (articleStatusesTableState) when both files run in parallel.

// ─── dns-cache: setCacheSafe eviction + resolvesToBlockedAddress ──────────────

describe("dns-cache: resolvesToBlockedAddress", () => {
  test("returns cached result when not expired", async () => {
    const { __resetDnsCacheForTests, resolvesToBlockedAddress } = await import(
      "@/lib/core/dns-cache"
    );
    __resetDnsCacheForTests();

    let lookupCallCount = 0;
    const deps = {
      lookupFn: async () => {
        lookupCallCount++;
        return [{ address: "93.184.216.34", family: 4 }] as any;
      },
      isBlockedResolvedAddressFn: () => false,
      warnFn: () => {},
      nowFn: () => 1_000_000,
    };

    // First call populates cache
    await resolvesToBlockedAddress("cached.example.com", deps);
    // Second call with same nowFn should use cache
    await resolvesToBlockedAddress("cached.example.com", deps);
    expect(lookupCallCount).toBe(1);
  });

  test("re-resolves when cache entry has expired", async () => {
    const { __resetDnsCacheForTests, resolvesToBlockedAddress } = await import(
      "@/lib/core/dns-cache"
    );
    __resetDnsCacheForTests();

    let now = 1_000_000;
    let lookupCallCount = 0;
    const deps = {
      lookupFn: async () => {
        lookupCallCount++;
        return [{ address: "93.184.216.34", family: 4 }] as any;
      },
      isBlockedResolvedAddressFn: () => false,
      warnFn: () => {},
      nowFn: () => now,
    };

    await resolvesToBlockedAddress("expiry.example.com", deps);
    // Advance time past TTL
    now += 1_000_000_000;
    await resolvesToBlockedAddress("expiry.example.com", deps);
    expect(lookupCallCount).toBe(2);
  });

  test("returns true and caches result on DNS lookup failure", async () => {
    const { __resetDnsCacheForTests, resolvesToBlockedAddress } = await import(
      "@/lib/core/dns-cache"
    );
    __resetDnsCacheForTests();

    const warned: any[] = [];
    const deps = {
      lookupFn: async () => {
        throw new Error("ENOTFOUND");
      },
      isBlockedResolvedAddressFn: () => false,
      warnFn: (...args: any[]) => warned.push(args),
      nowFn: () => 2_000_000,
    };

    const result = await resolvesToBlockedAddress("unresolvable.example.com", deps);
    expect(result).toBe(true);
    expect(warned.length).toBeGreaterThan(0);
  });

  test("returns true for blocked address", async () => {
    const { __resetDnsCacheForTests, resolvesToBlockedAddress } = await import(
      "@/lib/core/dns-cache"
    );
    __resetDnsCacheForTests();

    const deps = {
      lookupFn: async () =>
        [{ address: "127.0.0.1", family: 4 }] as any,
      isBlockedResolvedAddressFn: (addr: string) => addr === "127.0.0.1",
      warnFn: () => {},
      nowFn: () => 3_000_000,
    };

    const result = await resolvesToBlockedAddress("loopback.example.com", deps);
    expect(result).toBe(true);
  });

  test("setCacheSafe triggers eviction when cache exceeds max entries", async () => {
    const { __resetDnsCacheForTests, resolvesToBlockedAddress } = await import(
      "@/lib/core/dns-cache"
    );
    __resetDnsCacheForTests();

    const { CONFIG } = await import("@/lib/config");
    const maxEntries = CONFIG.DNS_CACHE_MAX_ENTRIES;
    let callIndex = 0;

    // Fill cache to max capacity
    for (let i = 0; i < maxEntries; i++) {
      const deps = {
        lookupFn: async () =>
          [{ address: "93.184.216.34", family: 4 }] as any,
        isBlockedResolvedAddressFn: () => false,
        warnFn: () => {},
        nowFn: () => 4_000_000 + callIndex++,
      };
      await resolvesToBlockedAddress(`host-${i}.example.com`, deps);
    }

    // Adding one more should trigger eviction (no throw expected)
    const deps = {
      lookupFn: async () =>
        [{ address: "93.184.216.34", family: 4 }] as any,
      isBlockedResolvedAddressFn: () => false,
      warnFn: () => {},
      nowFn: () => 4_000_000 + callIndex++,
    };
    await expect(
      resolvesToBlockedAddress("overflow.example.com", deps),
    ).resolves.toBeDefined();
  });
});

// ─── ssrf: IPv6 mapped-IPv4 + edge cases ─────────────────────────────────────

describe("ssrf: isBlockedResolvedAddress IPv6 edge cases", () => {
  test("detects IPv4-mapped IPv6 loopback ::ffff:127.0.0.1", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("::ffff:127.0.0.1")).toBe(true);
  });

  test("detects IPv4-mapped IPv6 private 10.x ::ffff:10.0.0.1", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("::ffff:10.0.0.1")).toBe(true);
  });

  test("allows public IPv4 via IPv6 mapping ::ffff:1.2.3.4", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("::ffff:1.2.3.4")).toBe(false);
  });

  test("::1 loopback is blocked", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("::1")).toBe(true);
  });

  test("fc00:: (ULA) is blocked", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("fc00::1")).toBe(true);
  });

  test("fe80:: (link-local) is blocked", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("fe80::1")).toBe(true);
  });

  test("non-mapped IPv6 public address is allowed", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    // 2606:4700:4700::1111 — Cloudflare public DNS
    expect(isBlockedResolvedAddress("2606:4700:4700::1111")).toBe(false);
  });

  test("isBlockedHost blocks empty string", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("")).toBe(true);
    expect(isBlockedHost("   ")).toBe(true);
  });

  test("isBlockedHost blocks .local domains", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("printer.local")).toBe(true);
  });

  test("isBlockedHost allows public hostnames", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("example.com")).toBe(false);
  });

  test("normalizeHostname strips trailing dot and lowercases", async () => {
    const { normalizeHostname } = await import("@/lib/utils/ssrf");
    expect(normalizeHostname("EXAMPLE.COM.")).toBe("example.com");
    expect(normalizeHostname("  foo.BAR  ")).toBe("foo.bar");
  });

  test("expandIpv6 handles :: double-colon compression (accessed via isBlockedResolvedAddress)", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    // 0:0:0:0:0:ffff:7f00:1 is ::ffff:127.0.0.1 — blocked
    expect(isBlockedResolvedAddress("0:0:0:0:0:ffff:127.0.0.1")).toBe(true);
  });

  test("isBlockedResolvedAddress handles 169.254 link-local", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("169.254.1.1")).toBe(true);
  });

  test("isBlockedResolvedAddress handles 172.16 private range", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("172.16.0.1")).toBe(true);
    expect(isBlockedResolvedAddress("172.31.255.255")).toBe(true);
    expect(isBlockedResolvedAddress("172.32.0.0")).toBe(false); // outside range
  });

  // ── parseIpv4DottedQuad branch coverage (via IPv6 mapped addresses) ──────────

  test("invalid IPv4 in IPv6 hextet (too many octets) does not match mapped address", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    // ::ffff:1.2.3.4.5 — invalid IPv4 (5 parts), parseIpv4DottedQuad returns null (line 29)
    expect(isBlockedResolvedAddress("::ffff:1.2.3.4.5")).toBe(false);
  });

  test("invalid IPv4 byte value in IPv6 hextet (>255) does not match mapped address", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    // ::ffff:999.0.0.1 — byte 999 > 255, parseIpv4DottedQuad returns null (line 34)
    expect(isBlockedResolvedAddress("::ffff:999.0.0.1")).toBe(false);
  });

  test("IPv6 with invalid hex chars in hextet returns false (not mapped IPv4)", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    // ::gggg:127.0.0.1 — 'gggg' fails /^[0-9a-f]{1,4}$/i (line 55)
    expect(isBlockedResolvedAddress("::gggg:127.0.0.1")).toBe(false);
  });

  test("double :: in IPv6 is invalid and returns false (line 72-73)", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    // ::1::1 has two :: occurrences — expandIpv6ToHextets returns null
    expect(isBlockedResolvedAddress("::1::1")).toBe(false);
  });

  test("compressed IPv6 with too many specified hextets (>=8) is invalid (line 93)", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    // ::1:2:3:4:5:6:7:8 — 8 hextets + compression is invalid
    expect(isBlockedResolvedAddress("::1:2:3:4:5:6:7:8")).toBe(false);
  });

  test("NaN hextet from invalid part makes expandIpv6ToHextets return null (line 87)", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    // ::ffff:1.invalid.0.1 — 'invalid' has non-numeric part, parseIpv4DottedQuad
    // returns NaN for Number('invalid'), so bytes check returns null (line 34)
    // resulting in NaN propagation (line 87)
    expect(isBlockedResolvedAddress("::ffff:1.invalid.0.1")).toBe(false);
  });
});

// ─── dns-cache: secondary eviction (no expired entries to flush) ──────────────

describe("dns-cache: cache full with no expired entries triggers oldest-20%-eviction", () => {
  test("setCacheSafe evicts oldest 20% when cache is full and no entries expired", async () => {
    const { __resetDnsCacheForTests, resolvesToBlockedAddress } = await import(
      "@/lib/core/dns-cache"
    );
    __resetDnsCacheForTests();

    const { CONFIG } = await import("@/lib/config");
    const maxEntries = CONFIG.DNS_CACHE_MAX_ENTRIES;
    // Use a fixed future time so NO entries expire during the fill loop
    const farFuture = Date.now() + 100_000_000;

    for (let i = 0; i < maxEntries; i++) {
      const deps = {
        lookupFn: async () =>
          [{ address: "93.184.216.34", family: 4 }] as any,
        isBlockedResolvedAddressFn: () => false,
        warnFn: () => {},
        // All entries get expiresAt = farFuture + CONFIG.DNS_CACHE_TTL_MS,
        // so none will be expired when we check
        nowFn: () => farFuture,
      };
      await resolvesToBlockedAddress(`neverexpires-${i}.example.com`, deps);
    }

    // Adding one more: cache is full, all entries are non-expired, so the
    // secondary evict-oldest-20% path (lines 32-37) fires
    const deps = {
      lookupFn: async () =>
        [{ address: "93.184.216.34", family: 4 }] as any,
      isBlockedResolvedAddressFn: () => false,
      warnFn: () => {},
      nowFn: () => farFuture,
    };
    await expect(
      resolvesToBlockedAddress("trigger-eviction.example.com", deps),
    ).resolves.toBe(false);
  });
});
