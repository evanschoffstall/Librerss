import { describe, expect, test } from "bun:test";

describe("core/reader-item-id", () => {
  test("encodes and decodes hex/decimal reader ids", async () => {
    const { toReaderItemId, parseReaderItemId } =
      await import("@/lib/core/stream-ids");

    const encoded = toReaderItemId(255);
    expect(encoded.endsWith("ff")).toBe(true);
    expect(parseReaderItemId(encoded)).toBe(255);
    expect(parseReaderItemId("255")).toBe(597);
    expect(parseReaderItemId("tag:google.com,2005:reader/item/0")).toBeNull();
    expect(parseReaderItemId(" ")).toBeNull();
  });
});

describe("core/feed-parser", () => {
  test("date parsing, dedupe, ranges, and item mapping", async () => {
    const {
      parseFeedItemDate,
      dedupePendingArticles,
      getPublicationDateRange,
      toPendingArticle,
    } = await import("@/lib/core/feed-parser");

    const fallback = new Date("2024-01-01T00:00:00.000Z");
    expect(parseFeedItemDate("invalid", fallback).toISOString()).toBe(
      fallback.toISOString(),
    );

    const now = new Date("2024-01-02T00:00:00.000Z");
    const items = [
      {
        title: "Old",
        link: " https://example.com/a ",
        publicationDate: fallback,
        content: "x",
        feedId: 1,
        lastChecked: now,
      },
      {
        title: "New",
        link: "https://example.com/a",
        publicationDate: now,
        content: "long content",
        feedId: 1,
        lastChecked: now,
      },
    ];

    const deduped = dedupePendingArticles(items);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.title).toBe("New");

    const range = getPublicationDateRange(deduped);
    expect(range.oldestPublicationDate).toBe("2024-01-02T00:00:00.000Z");
    expect(range.newestPublicationDate).toBe("2024-01-02T00:00:00.000Z");

    const mapped = toPendingArticle(
      {
        title: "A",
        link: "https://example.com/post",
        pubDate: "2024-01-03T00:00:00.000Z",
        contentSnippet: "snippet",
      },
      7,
      now,
    );
    expect(mapped?.feedId).toBe(7);
    expect(mapped?.link).toBe("https://example.com/post");
  });
});

describe("db helpers and transactions", () => {
  test("sanitizes db error messages and classifies SQL codes", async () => {
    const { sanitizeDbError, isUniqueConstraintError, isForeignKeyError } =
      await import("@/lib/db/db");

    const sanitized = sanitizeDbError(
      new Error("connect failed password=supersecret"),
    );
    expect(sanitized.message.includes("supersecret")).toBe(false);
    expect(isUniqueConstraintError({ code: "23505" })).toBe(true);
    expect(isForeignKeyError({ code: "23503" })).toBe(true);
    expect(isForeignKeyError({ code: "00000" })).toBe(false);
  });

  test("withTransaction returns operation value and propagates errors", async () => {
    const { withTransaction } = await import("@/lib/db/db");
    const value = await withTransaction(async () => "ok");
    expect(value).toBe("ok");
    await expect(
      withTransaction(async () => Promise.reject(new Error("tx-fail"))),
    ).rejects.toThrow("tx-fail");
  });
});

describe("core/runtime and utils/rate-limit", () => {
  test("runtime flags reflect env changes", async () => {
    const previousDb = process.env.DATABASE_URL;
    const previousSignup = process.env.ALLOW_SIGNUP;
    process.env.DATABASE_URL = "";
    process.env.ALLOW_SIGNUP = "off";

    const { RUNTIME_FLAGS, PLACEHOLDER_ADMIN_USER } =
      await import("@/lib/core/runtime");
    expect(RUNTIME_FLAGS.hasDatabaseUrl).toBe(false);
    expect(RUNTIME_FLAGS.usePlaceholderData).toBe(true);
    expect(RUNTIME_FLAGS.allowSignup).toBe(false);
    expect(PLACEHOLDER_ADMIN_USER.sessionToken).toMatch(/^[0-9a-f]{64}$/);

    process.env.DATABASE_URL = "postgres://localhost/db";
    process.env.ALLOW_SIGNUP = "yes";
    expect(RUNTIME_FLAGS.hasDatabaseUrl).toBe(true);
    expect(RUNTIME_FLAGS.usePlaceholderData).toBe(false);
    expect(RUNTIME_FLAGS.allowSignup).toBe(true);

    process.env.DATABASE_URL = previousDb;
    process.env.ALLOW_SIGNUP = previousSignup;
  });

  test("runtime flags default signup to disabled when ALLOW_SIGNUP is unset", async () => {
    const previousSignup = process.env.ALLOW_SIGNUP;
    delete process.env.ALLOW_SIGNUP;

    const { RUNTIME_FLAGS } = await import("@/lib/core/runtime");
    expect(RUNTIME_FLAGS.allowSignup).toBe(false);

    process.env.ALLOW_SIGNUP = previousSignup;
  });

  test("rate limiter enforces limits and supports trusted proxy extraction", async () => {
    const { RateLimiter } = await import("@/lib/server");
    const limiter = new RateLimiter();

    try {
      process.env.TRUSTED_PROXY_COUNT = "1";
      const request = new Request("https://example.com/api", {
        headers: {
          "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        },
      });

      expect(
        limiter.check(request, "key", { windowMs: 1000, maxAttempts: 1 }),
      ).toBeNull();
      const blocked = limiter.check(request, "key", {
        windowMs: 1000,
        maxAttempts: 1,
      });
      expect(blocked?.status).toBe(429);
    } finally {
      limiter.destroy();
    }
  });
});

describe("db/feed-records", () => {
  test("finds/creates feed records and manages category rows", async () => {
    const {
      findFeedIdByUrl,
      ensureFeedRecordByUrl,
      replaceUserFeedCategory,
      removeUserFeedCategory,
    } = await import("../lib/db/feed-records");

    const existingRow = {
      id: 11,
      url: "https://example.com/feed.xml",
      lastFetched: new Date("2024-01-01T00:00:00.000Z"),
      lastFetchError: null,
    };

    const insertCalls: unknown[] = [];
    const deleteCalls: unknown[] = [];

    const executor = {
      select: (_shape: unknown) => ({
        from: (_table: unknown) => ({
          where: (_condition: unknown) => ({
            limit: async () => [existingRow],
          }),
        }),
      }),
      insert: (_table: unknown) => ({
        values: (payload: unknown) => {
          insertCalls.push(payload);
          return {
            onConflictDoNothing: () => ({
              returning: async () => [existingRow],
            }),
            onConflictDoUpdate: async () => undefined,
          };
        },
      }),
      delete: (_table: unknown) => ({
        where: async (condition: unknown) => {
          deleteCalls.push(condition);
        },
      }),
    } as any;

    expect(
      await findFeedIdByUrl(executor, "https://example.com/feed.xml"),
    ).toBeGreaterThan(0);

    const ensured = await ensureFeedRecordByUrl(
      executor,
      "https://example.com/feed.xml",
    );
    expect(ensured.id).toBeGreaterThan(0);

    await replaceUserFeedCategory(executor, {
      userId: 1,
      feedId: 11,
      category: "Tech",
    });
    await removeUserFeedCategory(executor, {
      userId: 1,
      feedId: 11,
      category: "Tech",
    });
    await removeUserFeedCategory(executor, { userId: 1, feedId: 11 });

    expect(insertCalls.length).toBeGreaterThan(0);
    expect(deleteCalls.length).toBe(2);
  });
});
