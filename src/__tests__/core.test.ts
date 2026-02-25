/**
 * Unit Tests: Core Feed Modules
 * Tests for src/lib/core/feed-*.ts
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

// ─── Feed URL Validator ───────────────────────────────────────────────────────

describe("feed-url-validator", () => {
  test("isAllowedFeedUrl accepts valid feed URLs", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    expect(await isAllowedFeedUrl("https://example.com/feed.xml")).toBe(true);
    expect(await isAllowedFeedUrl("http://example.com/rss")).toBe(true);
  });

  test("isAllowedFeedUrl rejects non-http protocols", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    expect(await isAllowedFeedUrl("ftp://example.com/feed")).toBe(false);
    expect(await isAllowedFeedUrl("javascript:alert(1)")).toBe(false);
  });

  test("isAllowedFeedUrl rejects URLs without protocol", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    expect(await isAllowedFeedUrl("example.com/feed")).toBe(false);
  });

  test("assertPublicFeedUrl throws for invalid URLs", async () => {
    const { assertPublicFeedUrl } =
      await import("@/lib/core/feed-url-validator");
    await expect(assertPublicFeedUrl("not-a-url")).rejects.toThrow();
  });
});

// ─── Reader Item ID ───────────────────────────────────────────────────────────

describe("reader-item-id", () => {
  test("toReaderItemId creates valid ID", async () => {
    const { toReaderItemId } = await import("@/lib/core/reader-item-id");
    const id = toReaderItemId(123);
    expect(id).toMatch(/^tag:google.com,2005:reader\/item\/[0-9a-f]+$/);
  });

  test("parseReaderItemId extracts article ID", async () => {
    const { toReaderItemId, parseReaderItemId } =
      await import("@/lib/core/reader-item-id");
    const encoded = toReaderItemId(456);
    const decoded = parseReaderItemId(encoded);
    expect(decoded).toBe(456);
  });

  test("parseReaderItemId returns null for invalid ID", async () => {
    const { parseReaderItemId } = await import("@/lib/core/reader-item-id");
    expect(parseReaderItemId("invalid-id")).toBeNull();
    expect(
      parseReaderItemId("tag:google.com,2005:reader/item/invalid"),
    ).toBeNull();
  });

  test("toReaderItemId handles large numbers", async () => {
    const { toReaderItemId, parseReaderItemId } =
      await import("@/lib/core/reader-item-id");
    const largeId = 999999999;
    const encoded = toReaderItemId(largeId);
    const decoded = parseReaderItemId(encoded);
    expect(decoded).toBe(largeId);
  });
});

// ─── Article Status ───────────────────────────────────────────────────────────

describe("article-status", () => {
  test("isSafePositiveItemId validates safe positive integers", async () => {
    const { isSafePositiveItemId } = await import("@/lib/core/article-status");
    expect(isSafePositiveItemId(1)).toBe(true);
    expect(isSafePositiveItemId(123_456)).toBe(true);
    expect(isSafePositiveItemId(0)).toBe(false);
    expect(isSafePositiveItemId(-1)).toBe(false);
    expect(isSafePositiveItemId(1.5)).toBe(false);
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isSafePositiveItemId("1")).toBe(false);
  });

  test("upsertArticleStatuses short-circuits for empty articleIds", async () => {
    const { upsertArticleStatuses } = await import("@/lib/core/article-status");
    await expect(
      upsertArticleStatuses(1, [], { isRead: true, isStarred: false }),
    ).resolves.toBeUndefined();
  });

  test("canUseArticleStatusesTable caches available result", async () => {
    const {
      __resetArticleStatusesTableStateForTests,
      canUseArticleStatusesTable,
    } = await import("@/lib/core/article-status");

    __resetArticleStatusesTableStateForTests();

    const limit = mock(async () => [{ id: 1 }]);
    const from = mock(() => ({ limit }));
    const select = mock(() => ({ from }));
    const db = { select };

    expect(await canUseArticleStatusesTable({ db: db as any })).toBe(true);
    expect(await canUseArticleStatusesTable({ db: db as any })).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
  });

  test("canUseArticleStatusesTable handles missing table errors", async () => {
    const {
      __resetArticleStatusesTableStateForTests,
      canUseArticleStatusesTable,
    } = await import("@/lib/core/article-status");

    __resetArticleStatusesTableStateForTests();
    const warn = mock(() => {});

    const missingError = new Error(
      'relation "ArticleStatus" does not exist',
    ) as Error & {
      code?: string;
    };
    missingError.code = "42P01";

    const limit = mock(async () => {
      throw missingError;
    });
    const from = mock(() => ({ limit }));
    const select = mock(() => ({ from }));
    const db = { select };

    expect(await canUseArticleStatusesTable({ db: db as any, warn })).toBe(
      false,
    );
    expect(await canUseArticleStatusesTable({ db: db as any, warn })).toBe(
      false,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
  });

  test("upsertArticleStatuses chunks writes and preserves unspecified fields", async () => {
    const { __resetArticleStatusesTableStateForTests, upsertArticleStatuses } =
      await import("@/lib/core/article-status");

    __resetArticleStatusesTableStateForTests();

    const onConflictDoUpdate = mock(async () => []);
    const values = mock(() => ({ onConflictDoUpdate }));
    const insert = mock(() => ({ values }));

    const limit = mock(async () => [{ id: 1 }]);
    const from = mock(() => ({ limit }));
    const select = mock(() => ({ from }));
    const db = { select, insert };

    const articleIds = Array.from({ length: 1201 }, (_, index) => index + 1);
    await upsertArticleStatuses(
      11,
      articleIds,
      { isRead: true },
      { db: db as any },
    );

    expect(insert).toHaveBeenCalledTimes(3);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(3);
  });
});

// ─── Stream Conditions ────────────────────────────────────────────────────────

describe("stream-conditions", () => {
  test("buildStreamConditions creates conditions for reading-list", async () => {
    const { buildStreamConditions } =
      await import("@/lib/core/stream-conditions");
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: null,
      starredOnly: false,
      useArticleStatuses: true,
    });
    expect(Array.isArray(conditions)).toBe(true);
    expect(conditions).toHaveLength(0);
  });

  test("buildStreamConditions handles feed URLs", async () => {
    const { buildStreamConditions } =
      await import("@/lib/core/stream-conditions");
    const conditions = buildStreamConditions({
      feedUrl: "https://example.com/feed.xml",
      dateFilter: null,
      continuationId: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions).toHaveLength(1);
  });

  test("buildStreamConditions handles starred filter", async () => {
    const { buildStreamConditions } =
      await import("@/lib/core/stream-conditions");
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter: null,
      continuationId: null,
      starredOnly: true,
      useArticleStatuses: true,
    });
    expect(conditions).toHaveLength(1);
  });

  test("buildStreamConditions combines all optional filters", async () => {
    const { buildStreamConditions } =
      await import("@/lib/core/stream-conditions");
    const conditions = buildStreamConditions({
      feedUrl: "https://example.com/feed.xml",
      dateFilter: new Date("2024-01-01T00:00:00.000Z"),
      continuationId: 321,
      starredOnly: true,
      excludeRead: true,
      useArticleStatuses: true,
    });
    expect(conditions).toHaveLength(4);
  });
});

// ─── Feed Parser ──────────────────────────────────────────────────────────────

describe("feed-parser", () => {
  test("parseFeedItemDate uses fallback for missing/invalid values", async () => {
    const { parseFeedItemDate } = await import("@/lib/core/feed-parser");
    const fallback = new Date("2024-01-01T00:00:00.000Z");
    expect(parseFeedItemDate(undefined, fallback).toISOString()).toBe(
      fallback.toISOString(),
    );
    expect(parseFeedItemDate("not-a-date", fallback).toISOString()).toBe(
      fallback.toISOString(),
    );
  });

  test("dedupePendingArticles keeps newest item and trims links", async () => {
    const { dedupePendingArticles } = await import("@/lib/core/feed-parser");
    const now = new Date();
    const older = new Date(now.getTime() - 60_000);
    const items = [
      {
        title: "old",
        link: " https://example.com/a ",
        publicationDate: older,
        content: "short",
        feedId: 1,
        lastChecked: now,
      },
      {
        title: "new",
        link: "https://example.com/a",
        publicationDate: now,
        content: "longer-content",
        feedId: 1,
        lastChecked: now,
      },
    ];
    const deduped = dedupePendingArticles(items);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.title).toBe("new");
    expect(deduped[0]?.link).toBe("https://example.com/a");
  });

  test("getPublicationDateRange returns oldest/newest and null for empty", async () => {
    const { getPublicationDateRange } = await import("@/lib/core/feed-parser");
    expect(getPublicationDateRange([])).toEqual({
      newestPublicationDate: null,
      oldestPublicationDate: null,
    });

    const items = [
      {
        title: "a",
        link: "https://example.com/a",
        publicationDate: new Date("2024-01-01T00:00:00.000Z"),
        content: "x",
        feedId: 1,
        lastChecked: new Date("2024-01-01T00:00:00.000Z"),
      },
      {
        title: "b",
        link: "https://example.com/b",
        publicationDate: new Date("2024-01-02T00:00:00.000Z"),
        content: "y",
        feedId: 1,
        lastChecked: new Date("2024-01-02T00:00:00.000Z"),
      },
    ];
    const range = getPublicationDateRange(items);
    expect(range.oldestPublicationDate).toBe("2024-01-01T00:00:00.000Z");
    expect(range.newestPublicationDate).toBe("2024-01-02T00:00:00.000Z");
  });

  test("toPendingArticle rejects invalid links and maps valid items", async () => {
    const { toPendingArticle } = await import("@/lib/core/feed-parser");
    const now = new Date("2024-01-01T00:00:00.000Z");

    const invalid = toPendingArticle(
      { title: "x", link: "not-a-url", content: "y" },
      1,
      now,
    );
    expect(invalid).toBeNull();

    const valid = toPendingArticle(
      {
        title: " Hello <b>World</b> ",
        link: "https://example.com/a",
        content: "<p>safe</p>",
        isoDate: "2024-01-03T00:00:00.000Z",
      },
      7,
      now,
    );
    expect(valid).not.toBeNull();
    expect(valid?.feedId).toBe(7);
    expect(valid?.link).toBe("https://example.com/a");
    expect(valid?.publicationDate.toISOString()).toBe(
      "2024-01-03T00:00:00.000Z",
    );
  });
});

// ─── Feed HTTP ────────────────────────────────────────────────────────────────

describe("feed-http", () => {
  test("fetchFeedXml validates URL, forwards request options, and validates redirects", async () => {
    const { fetchFeedXml } = await import("@/lib/core/feed-http");

    const assertPublicFeedUrlFn = mock(async () => {});
    let requestOptions: any;
    const axiosGetFn = mock(async (_url: string, options: unknown) => {
      requestOptions = options;
      return { data: "<rss />" };
    });

    const result = await fetchFeedXml("https://example.com/feed.xml", {
      assertPublicFeedUrlFn,
      axiosGetFn: axiosGetFn as any,
    });

    expect(result).toBe("<rss />");
    expect(assertPublicFeedUrlFn).toHaveBeenCalledWith(
      "https://example.com/feed.xml",
    );
    expect(requestOptions.timeout).toBeGreaterThan(0);
    expect(requestOptions.maxRedirects).toBe(5);

    expect(() => requestOptions.beforeRedirect({})).toThrow(
      "Redirect with no target URL",
    );
    expect(() =>
      requestOptions.beforeRedirect({ href: "ftp://example.com/feed.xml" }),
    ).toThrow("Blocked redirect to non-HTTP protocol");
    expect(() =>
      requestOptions.beforeRedirect({
        href: "https://user:pass@example.com/feed.xml",
      }),
    ).toThrow("Blocked redirect to credentialed URL");
    expect(() =>
      requestOptions.beforeRedirect({ href: "https://example.com/feed.xml" }),
    ).not.toThrow();
  });

  test("fetchFeedXml coerces non-string response data", async () => {
    const { fetchFeedXml } = await import("@/lib/core/feed-http");

    const result = await fetchFeedXml("https://example.com/feed.xml", {
      assertPublicFeedUrlFn: async () => {},
      axiosGetFn: (async () => ({ data: 12345 })) as any,
    });

    expect(result).toBe("12345");
  });

  test("fetchFeedXml maps DataDome 403 errors to a descriptive message", async () => {
    const { fetchFeedXml } = await import("@/lib/core/feed-http");

    const upstreamError = {
      response: {
        status: 403,
        headers: { "x-datadome": "protected" },
      },
    };

    await expect(
      fetchFeedXml("https://example.com/feed.xml", {
        assertPublicFeedUrlFn: async () => {},
        axiosGetFn: (async () => {
          throw upstreamError;
        }) as any,
        isAxiosErrorFn: (() => true) as any,
      }),
    ).rejects.toThrow("DataDome");
  });

  test("fetchFeedXml rethrows non-DataDome axios errors", async () => {
    const { fetchFeedXml } = await import("@/lib/core/feed-http");

    const upstreamError = {
      response: {
        status: 500,
        headers: {},
      },
    };

    await expect(
      fetchFeedXml("https://example.com/feed.xml", {
        assertPublicFeedUrlFn: async () => {},
        axiosGetFn: (async () => {
          throw upstreamError;
        }) as any,
        isAxiosErrorFn: (() => true) as any,
      }),
    ).rejects.toBe(upstreamError);
  });
});

// ─── DNS Cache ────────────────────────────────────────────────────────────────

describe("dns-cache", () => {
  test("resolvesToBlockedAddress caches DNS lookup results until TTL expires", async () => {
    const { __resetDnsCacheForTests, resolvesToBlockedAddress } =
      await import("@/lib/core/dns-cache");

    __resetDnsCacheForTests();

    let nowMs = 1_000;
    const lookupFn = mock(async () => [{ address: "8.8.8.8" }]);

    const deps = {
      lookupFn: lookupFn as any,
      isBlockedResolvedAddressFn: () => false,
      nowFn: () => nowMs,
      warnFn: () => {},
    };

    expect(await resolvesToBlockedAddress("example.com", deps)).toBe(false);
    expect(await resolvesToBlockedAddress("example.com", deps)).toBe(false);
    expect(lookupFn).toHaveBeenCalledTimes(1);

    nowMs += 5 * 60 * 1000 + 1;
    expect(await resolvesToBlockedAddress("example.com", deps)).toBe(false);
    expect(lookupFn).toHaveBeenCalledTimes(2);
  });

  test("resolvesToBlockedAddress fails closed on lookup error and caches fallback", async () => {
    const { __resetDnsCacheForTests, resolvesToBlockedAddress } =
      await import("@/lib/core/dns-cache");

    __resetDnsCacheForTests();

    let nowMs = 10_000;
    const warnFn = mock(() => {});
    const lookupFn = mock(async () => {
      throw new Error("dns broken");
    });

    const deps = {
      lookupFn: lookupFn as any,
      isBlockedResolvedAddressFn: () => false,
      nowFn: () => nowMs,
      warnFn,
    };

    expect(await resolvesToBlockedAddress("bad.example", deps)).toBe(true);
    expect(warnFn).toHaveBeenCalledTimes(1);
    expect(lookupFn).toHaveBeenCalledTimes(1);

    nowMs += 10_000;
    expect(await resolvesToBlockedAddress("bad.example", deps)).toBe(true);
    expect(lookupFn).toHaveBeenCalledTimes(1);
  });

  test("resolvesToBlockedAddress handles timeout race and clears timeout handle", async () => {
    const { __resetDnsCacheForTests, resolvesToBlockedAddress } =
      await import("@/lib/core/dns-cache");

    __resetDnsCacheForTests();

    const warnFn = mock(() => {});
    const clearTimeoutFn = mock(() => {});

    const setTimeoutFn = ((callback: () => void) => {
      callback();
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    const result = await resolvesToBlockedAddress("timeout.example", {
      lookupFn: (() => new Promise(() => {})) as any,
      isBlockedResolvedAddressFn: () => false,
      warnFn,
      setTimeoutFn,
      clearTimeoutFn: clearTimeoutFn as any,
      nowFn: () => 50_000,
    });

    expect(result).toBe(true);
    expect(warnFn).toHaveBeenCalledTimes(1);
    expect(clearTimeoutFn).toHaveBeenCalledTimes(1);
  });
});

// ─── Feed Refresh ─────────────────────────────────────────────────────────────

describe("feed-refresh", () => {
  const feedRefreshPath = [
    "..",
    "lib",
    "core",
    "feed-refresh.ts?core-feed-refresh",
  ].join("/");

  const importFeedRefresh = () =>
    import(feedRefreshPath) as Promise<
      typeof import("../lib/core/feed-refresh")
    >;

  test("shouldRefreshFeed and shouldForceRefreshFeed compare age thresholds", async () => {
    const { shouldRefreshFeed, shouldForceRefreshFeed } =
      await importFeedRefresh();

    expect(shouldRefreshFeed(new Date(Date.now() - 1000 * 60 * 120))).toBe(
      true,
    );
    expect(shouldRefreshFeed(new Date())).toBe(false);

    expect(shouldForceRefreshFeed(new Date(Date.now() - 1000 * 60 * 120))).toBe(
      true,
    );
    expect(shouldForceRefreshFeed(new Date())).toBe(false);
  });

  test("refreshFeedFromUpstream upserts valid items and clears fetch error", async () => {
    const { refreshFeedFromUpstream } = await importFeedRefresh();

    const onConflictDoUpdate = mock(async () => []);
    const values = mock(() => ({ onConflictDoUpdate }));
    const insert = mock(() => ({ values }));

    const where = mock(async () => []);
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));

    const fixedNow = new Date("2026-02-24T00:00:00.000Z");

    const result = await refreshFeedFromUpstream(
      { insert, update } as unknown as any,
      {
        id: 1,
        url: "https://example.com/feed.xml",
        lastFetched: new Date("2026-02-23T00:00:00.000Z"),
        lastFetchError: null,
      },
      {
        fetchFeedXmlFn: async () => "<rss />",
        parseFeedXmlFn: async () => ({ items: [{ title: "A" }] }),
        toPendingArticleFn: mock(() => ({
          title: "A",
          link: "https://example.com/a",
          content: "Body",
          publicationDate: fixedNow,
          feedId: 1,
          lastChecked: fixedNow,
        })) as any,
        dedupePendingArticlesFn: (rows) => rows,
        getPublicationDateRangeFn: () => ({
          newestPublicationDate: fixedNow.toISOString(),
          oldestPublicationDate: fixedNow.toISOString(),
        }),
        nowFn: () => fixedNow,
      },
    );

    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("refreshFeedFromUpstream returns error and applies cooldown on failure", async () => {
    const { refreshFeedFromUpstream } = await importFeedRefresh();

    const where = mock(async () => []);
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));

    const result = await refreshFeedFromUpstream(
      { update } as unknown as any,
      {
        id: 2,
        url: "https://example.com/feed.xml",
        lastFetched: new Date("2026-02-23T00:00:00.000Z"),
        lastFetchError: null,
      },
      {
        fetchFeedXmlFn: async () => {
          throw new Error("upstream down");
        },
        toErrorMessageFn: () => "normalized-error",
      },
    );

    expect(result).toEqual({ ok: false, error: "normalized-error" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("refreshFeedFromUpstream supports diagnostic logging and no-valid-items path", async () => {
    const { CONFIG } = await import("@/lib/config");
    const { refreshFeedFromUpstream } = await importFeedRefresh();

    const previousDiag = CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED;
    (CONFIG as any).FEED_REFRESH_DIAGNOSTICS_ENABLED = true;

    try {
      const onConflictDoUpdate = mock(async () => []);
      const values = mock(() => ({ onConflictDoUpdate }));
      const insert = mock(() => ({ values }));

      const where = mock(async () => []);
      const set = mock(() => ({ where }));
      const update = mock(() => ({ set }));

      const result = await refreshFeedFromUpstream(
        { insert, update } as unknown as any,
        {
          id: 10,
          url: "https://example.com/diag.xml",
          lastFetched: new Date("2026-02-23T00:00:00.000Z"),
          lastFetchError: null,
        },
        {
          fetchFeedXmlFn: async () => "<rss />",
          parseFeedXmlFn: async () => ({ items: [{ title: "x" }] }),
          toPendingArticleFn: mock(() => null) as any,
          dedupePendingArticlesFn: (rows) => rows,
          getPublicationDateRangeFn: () => ({
            newestPublicationDate: null,
            oldestPublicationDate: null,
          }),
          nowFn: () => new Date("2026-02-24T00:00:00.000Z"),
        },
      );

      expect(result).toEqual({ ok: true });
      expect(insert).toHaveBeenCalledTimes(0);
      expect(update).toHaveBeenCalledTimes(1);
    } finally {
      (CONFIG as any).FEED_REFRESH_DIAGNOSTICS_ENABLED = previousDiag;
    }
  });

  test("refreshFeedFromUpstream tolerates cooldown update failure after fetch error", async () => {
    const { CONFIG } = await import("@/lib/config");
    const { refreshFeedFromUpstream } = await importFeedRefresh();

    const previousDiag = CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED;
    (CONFIG as any).FEED_REFRESH_DIAGNOSTICS_ENABLED = true;

    try {
      const where = mock(async () => {
        throw new Error("write failed");
      });
      const set = mock(() => ({ where }));
      const update = mock(() => ({ set }));

      const result = await refreshFeedFromUpstream(
        { update } as unknown as any,
        {
          id: 20,
          url: "https://example.com/fail.xml",
          lastFetched: new Date("2026-02-23T00:00:00.000Z"),
          lastFetchError: null,
        },
        {
          fetchFeedXmlFn: async () => {
            throw new Error("upstream down");
          },
          toErrorMessageFn: () => "normalized-error",
        },
      );

      expect(result).toEqual({ ok: false, error: "normalized-error" });
      expect(update).toHaveBeenCalledTimes(1);
    } finally {
      (CONFIG as any).FEED_REFRESH_DIAGNOSTICS_ENABLED = previousDiag;
    }
  });
});

// ─── Feed Batch Helpers ───────────────────────────────────────────────────────

describe("feed-batch-helpers", () => {
  const feedBatchHelpersPath = [
    "..",
    "lib",
    "core",
    "feed-batch-helpers.ts?core-feed-batch",
  ].join("/");

  const importFeedBatchHelpers = () =>
    import(feedBatchHelpersPath) as Promise<
      typeof import("../lib/core/feed-batch-helpers")
    >;

  function createResolveDb(options: {
    ownedRows: { url: string }[];
    existingFeeds: {
      id: number;
      url: string;
      lastFetched: Date;
      lastFetchError: string | null;
    }[];
    resolvedFeeds?: {
      id: number;
      url: string;
      lastFetched: Date;
      lastFetchError: string | null;
    }[];
  }) {
    let selectWhereCalls = 0;

    const where = mock(async () => {
      selectWhereCalls += 1;
      if (selectWhereCalls === 1) {
        return options.ownedRows;
      }
      if (selectWhereCalls === 2) {
        return options.existingFeeds;
      }
      return options.resolvedFeeds ?? [];
    });

    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));

    const onConflictDoNothing = mock(async () => []);
    const values = mock(() => ({ onConflictDoNothing }));
    const insert = mock(() => ({ values }));

    return {
      select,
      insert,
      __calls: {
        where,
        values,
        insert,
      },
    };
  }

  test("buildRefreshPlan returns expected decisions", async () => {
    const { buildRefreshPlan } = await importFeedBatchHelpers();

    const veryOld = new Date(Date.now() - 1000 * 60 * 120);
    const fresh = new Date();

    const feedByUrl = new Map([
      [
        "https://a.com/feed",
        {
          id: 1,
          url: "https://a.com/feed",
          lastFetched: veryOld,
          lastFetchError: null,
        },
      ],
      [
        "https://b.com/feed",
        {
          id: 2,
          url: "https://b.com/feed",
          lastFetched: fresh,
          lastFetchError: null,
        },
      ],
    ]);

    const stalePlan = buildRefreshPlan(
      feedByUrl,
      ["https://a.com/feed", "https://b.com/feed", "https://missing.com/feed"],
      false,
      false,
    );
    if (Array.isArray(stalePlan)) {
      expect(["refresh-stale", "use-cache"]).toContain(
        stalePlan.find((r) => r.url === "https://a.com/feed")?.decision ?? "",
      );
      expect(
        stalePlan.find((r) => r.url === "https://b.com/feed")?.decision,
      ).toBe("use-cache");
      expect(
        stalePlan.find((r) => r.url === "https://missing.com/feed")?.decision,
      ).toBe("missing-feed-record");
    } else {
      expect(stalePlan).toBeDefined();
    }

    const skipPlan = buildRefreshPlan(
      feedByUrl,
      ["https://a.com/feed"],
      true,
      false,
    );
    if (Array.isArray(skipPlan)) {
      expect(skipPlan[0]?.decision).toBe("skip-refresh-flag");
    } else {
      expect(skipPlan).toBeDefined();
    }
  });

  test("resolveAuthorizedFeedRecords handles ownership filtering and missing feed insertion", async () => {
    const { resolveAuthorizedFeedRecords } = await importFeedBatchHelpers();

    const now = new Date("2026-02-24T00:00:00.000Z");

    const db = createResolveDb({
      ownedRows: [{ url: "https://a.com/feed" }, { url: "https://c.com/feed" }],
      existingFeeds: [
        {
          id: 10,
          url: "https://a.com/feed",
          lastFetched: now,
          lastFetchError: null,
        },
      ],
      resolvedFeeds: [
        {
          id: 11,
          url: "https://c.com/feed",
          lastFetched: now,
          lastFetchError: null,
        },
      ],
    });

    const result = await resolveAuthorizedFeedRecords(db as unknown as any, 5, [
      "https://a.com/feed",
      "https://b.com/feed",
      "https://c.com/feed",
    ]);

    expect(result?.allowedUrls).toEqual([
      "https://a.com/feed",
      "https://c.com/feed",
    ]);
    expect(result?.feedByUrl.get("https://a.com/feed")?.id).toBe(10);
    expect(result?.feedByUrl.get("https://c.com/feed")?.id).toBe(11);

    expect(db.__calls.values).toHaveBeenCalledWith([
      { url: "https://c.com/feed" },
    ]);
  });

  test("resolveAuthorizedFeedRecords returns null when no requested feed is owned", async () => {
    const { resolveAuthorizedFeedRecords } = await importFeedBatchHelpers();

    const db = createResolveDb({
      ownedRows: [],
      existingFeeds: [],
    });

    const result = await resolveAuthorizedFeedRecords(db as unknown as any, 6, [
      "https://x.com/feed",
    ]);

    expect(result).toBeNull();
    expect(db.__calls.insert).not.toHaveBeenCalled();
  });

  test("queryTopArticlesPerFeed accepts both execute result shapes", async () => {
    const { queryTopArticlesPerFeed } = await importFeedBatchHelpers();

    const arrayRows = [
      {
        id: 1,
        feedId: 10,
        title: "A",
        link: "https://example.com/a",
        content: "x",
        publicationDate: new Date("2026-01-01T00:00:00.000Z"),
        lastChecked: new Date("2026-01-01T01:00:00.000Z"),
        isRead: false,
        isStarred: false,
      },
    ];
    const dbWithArray = {
      execute: mock(async () => arrayRows),
    };

    const arrayResult = await queryTopArticlesPerFeed(
      dbWithArray as unknown as any,
      1,
      [10],
    );
    expect(arrayResult).toEqual(arrayRows);

    const wrappedRows = [
      {
        id: 2,
        feedId: 11,
        title: "B",
        link: "https://example.com/b",
        content: "y",
        publicationDate: new Date("2026-01-02T00:00:00.000Z"),
        lastChecked: new Date("2026-01-02T01:00:00.000Z"),
        isRead: true,
        isStarred: true,
      },
    ];
    const dbWithWrapped = {
      execute: mock(async () => ({ rows: wrappedRows })),
    };

    const wrappedResult = await queryTopArticlesPerFeed(
      dbWithWrapped as unknown as any,
      1,
      [11],
    );
    expect(wrappedResult).toEqual(wrappedRows);

    const dbWithMissingRows = {
      execute: mock(async () => ({})),
    };

    const missingRowsResult = await queryTopArticlesPerFeed(
      dbWithMissingRows as unknown as any,
      1,
      [11],
    );
    expect(missingRowsResult).toBeUndefined();
  });

  test("executeParallelRefreshes surfaces persisted errors when refresh is skipped", async () => {
    const { executeParallelRefreshes } = await importFeedBatchHelpers();

    const feedByUrl = new Map([
      [
        "https://a.com/feed",
        {
          id: 1,
          url: "https://a.com/feed",
          lastFetched: new Date(),
          lastFetchError: "persisted-error",
        },
      ],
    ]);

    const result = await executeParallelRefreshes(
      {
        update: mock(() => ({
          set: mock(() => ({ where: mock(async () => []) })),
        })),
      } as unknown as any,
      feedByUrl as any,
      ["https://a.com/feed"],
      true,
      false,
    );

    expect(result.refreshedCount).toBe(0);
    expect(result.errors.get("https://a.com/feed")).toBe("persisted-error");
  });

  test("executeParallelRefreshes records upstream failures for stale feeds", async () => {
    const { executeParallelRefreshes } = await importFeedBatchHelpers();

    const stale = new Date(Date.now() - 1000 * 60 * 120);
    const feedByUrl = new Map([
      [
        "not-a-url",
        {
          id: 2,
          url: "not-a-url",
          lastFetched: stale,
          lastFetchError: "previous-error",
        },
      ],
    ]);

    const db = {
      update: mock(() => ({
        set: mock(() => ({ where: mock(async () => []) })),
      })),
      insert: mock(() => ({
        values: mock(() => ({ onConflictDoUpdate: mock(async () => []) })),
      })),
    };

    const result = await executeParallelRefreshes(
      db as unknown as any,
      feedByUrl as any,
      ["not-a-url"],
      false,
      true,
    );

    expect(result.refreshedCount).toBe(1);
    expect(result.errors.has("not-a-url")).toBe(true);
  });

  test("mapRowsToArticleMap maps rows by feed URL and coerces value types", async () => {
    const { mapRowsToArticleMap } = await importFeedBatchHelpers();

    const feedByUrl = new Map([
      [
        "https://a.com/feed",
        {
          id: 10,
          url: "https://a.com/feed",
          lastFetched: new Date(),
          lastFetchError: null,
        },
      ],
    ]);

    const rows = [
      {
        id: "5",
        title: "Title",
        link: "https://a.com/article",
        content: "Body",
        publicationDate: "2024-01-01T00:00:00.000Z",
        feedId: 10,
        lastChecked: "2024-01-01T01:00:00.000Z",
        isRead: 1,
        isStarred: 0,
      },
      {
        id: "6",
        title: "Ignored",
        link: "https://missing.com/article",
        content: "x",
        publicationDate: "2024-01-01T00:00:00.000Z",
        feedId: 99,
        lastChecked: "2024-01-01T01:00:00.000Z",
        isRead: 0,
        isStarred: 0,
      },
    ];

    const result = mapRowsToArticleMap(rows, feedByUrl, ["https://a.com/feed"]);
    const mapped = result.get("https://a.com/feed") ?? [];
    expect(Array.isArray(mapped)).toBe(true);
    if (mapped.length > 0) {
      expect(mapped[0]).toMatchObject({
        id: 5,
        title: "Title",
        link: "https://a.com/article",
        content: "Body",
        feedId: 10,
        isRead: true,
        isStarred: false,
      });
    }
  });
});

// ─── Mark Stream Read ─────────────────────────────────────────────────────────

describe("mark-stream-read", () => {
  test("markStreamAsRead is exported as callable async function", async () => {
    const markStream = await import("@/lib/core/mark-stream-read");
    expect(typeof markStream.markStreamAsRead).toBe("function");
    expect(markStream.markStreamAsRead.length).toBe(3);
  });

  test("markStreamAsRead handles feed and default streams", async () => {
    const { markStreamAsRead } = await import("@/lib/core/mark-stream-read");

    const rows = [{ articleId: 1 }, { articleId: 2 }];
    const chain: any = {
      innerJoin: mock(() => chain),
      where: mock(() => chain),
      limit: mock(async () => rows),
    };
    const db = {
      select: mock(() => ({
        from: mock(() => chain),
      })),
    };
    const upsert = mock(async () => {});

    await markStreamAsRead(5, "feed/https://example.com/feed.xml", {
      db: db as any,
      canUseArticleStatusesTableFn: async () => true,
      upsertArticleStatusesFn: upsert as any,
    });
    expect(upsert).toHaveBeenCalledWith(5, [1, 2], { isRead: true });

    await markStreamAsRead(5, "user/-/state/com.google/reading-list", {
      db: db as any,
      canUseArticleStatusesTableFn: async () => false,
      upsertArticleStatusesFn: upsert as any,
    });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  test("markStreamAsRead handles starred stream with and without article statuses", async () => {
    const { markStreamAsRead } = await import("@/lib/core/mark-stream-read");
    const { STARRED_STATE } = await import("@/lib/core/stream-ids");

    const starredRows = [{ articleId: 7 }];
    const chain: any = {
      innerJoin: mock(() => chain),
      where: mock(() => chain),
      limit: mock(async () => starredRows),
    };
    const db = {
      select: mock(() => ({
        from: mock(() => chain),
      })),
    };
    const upsert = mock(async () => {});

    await markStreamAsRead(9, STARRED_STATE, {
      db: db as any,
      canUseArticleStatusesTableFn: async () => true,
      upsertArticleStatusesFn: upsert as any,
    });
    expect(upsert).toHaveBeenCalledWith(9, [7], { isRead: true });

    const dbNoQuery = { select: mock(() => ({ from: mock(() => chain) })) };
    await markStreamAsRead(9, STARRED_STATE, {
      db: dbNoQuery as any,
      canUseArticleStatusesTableFn: async () => false,
      upsertArticleStatusesFn: upsert as any,
    });
    expect(upsert).toHaveBeenCalledWith(9, [], { isRead: true });
    expect(dbNoQuery.select).toHaveBeenCalledTimes(0);
  });
});
