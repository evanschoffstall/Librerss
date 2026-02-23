/**
 * Unit Tests: Database Layer
 * Tests for src/lib/db/
 */

import { describe, expect, test } from "bun:test";

// ─── Query Builders ───────────────────────────────────────────────────────────

describe("query-builders", () => {
  test("buildArticleQuery constructs base query", async () => {
    const { buildArticleQuery } = await import("@/lib/db/query-builders");
    const query = buildArticleQuery({ userId: 1 });
    expect(query).toEqual({
      scope: "articles",
      userId: 1,
      filters: { unreadOnly: false, starredOnly: false },
    });
  });

  test("buildArticleQuery adds unread filter", async () => {
    const { buildArticleQuery } = await import("@/lib/db/query-builders");
    const query = buildArticleQuery({
      userId: 1,
      filters: { unreadOnly: true },
    });
    expect(query.filters).toEqual({ unreadOnly: true, starredOnly: false });
  });

  test("buildArticleQuery adds starred filter", async () => {
    const { buildArticleQuery } = await import("@/lib/db/query-builders");
    const query = buildArticleQuery({
      userId: 1,
      filters: { starredOnly: true },
    });
    expect(query.filters).toEqual({ unreadOnly: false, starredOnly: true });
  });

  test("buildFeedQuery constructs base query", async () => {
    const { buildFeedQuery } = await import("@/lib/db/query-builders");
    const query = buildFeedQuery({ userId: 1 });
    expect(query).toEqual({ scope: "feeds", userId: 1 });
  });
});

// ─── Schema ───────────────────────────────────────────────────────────────────

describe("schema", () => {
  test("schema exports users table", async () => {
    const { users } = await import("@/lib/db/schema");
    expect(users.id).toBeDefined();
    expect(users.email).toBeDefined();
    expect(users.passwordHash).toBeDefined();
  });

  test("schema exports feeds table", async () => {
    const { feeds } = await import("@/lib/db/schema");
    expect(feeds.id).toBeDefined();
    expect(feeds.url).toBeDefined();
    expect(feeds.lastFetched).toBeDefined();
  });

  test("schema exports articles table", async () => {
    const { articles } = await import("@/lib/db/schema");
    expect(articles.id).toBeDefined();
    expect(articles.link).toBeDefined();
    expect(articles.feedId).toBeDefined();
  });

  test("schema exports articleStatus table", async () => {
    const { articleStatus, articleStatuses } = await import("@/lib/db/schema");
    expect(articleStatus).toBe(articleStatuses);
  });

  test("schema exports categories table", async () => {
    const { categories, feedCategories } = await import("@/lib/db/schema");
    expect(categories).toBe(feedCategories);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe("db-helpers", () => {
  test("sanitizeDbError removes sensitive info", async () => {
    const { sanitizeDbError } = await import("@/lib/db/helpers");
    const error = new Error("connection failed: password=secret123");
    const sanitized = sanitizeDbError(error);
    expect(sanitized.message).not.toContain("secret123");
  });

  test("isUniqueConstraintError detects unique violations", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/helpers");
    const uniqueError = { code: "23505" } as any;
    const otherError = { code: "23503" } as any;

    expect(isUniqueConstraintError(uniqueError)).toBe(true);
    expect(isUniqueConstraintError(otherError)).toBe(false);
  });

  test("isForeignKeyError detects foreign key violations", async () => {
    const { isForeignKeyError } = await import("@/lib/db/helpers");
    const fkError = { code: "23503" } as any;
    const otherError = { code: "23505" } as any;

    expect(isForeignKeyError(fkError)).toBe(true);
    expect(isForeignKeyError(otherError)).toBe(false);
  });
});

// ─── Transactions ─────────────────────────────────────────────────────────────

describe("transactions", () => {
  test("withTransaction wraps operations", async () => {
    const { withTransaction } = await import("@/lib/db/transactions");
    const value = await withTransaction(async () => "ok");
    expect(value).toBe("ok");
  });

  test("withTransaction handles errors", async () => {
    const { withTransaction } = await import("@/lib/db/transactions");

    const operation = async () => {
      throw new Error("Test error");
    };

    await expect(withTransaction(operation)).rejects.toThrow("Test error");
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe("pagination", () => {
  test("calculateOffset computes correct offset", async () => {
    const { calculateOffset } = await import("@/lib/db/pagination");
    expect(calculateOffset(1, 20)).toBe(0);
    expect(calculateOffset(2, 20)).toBe(20);
    expect(calculateOffset(3, 20)).toBe(40);
  });

  test("validatePage ensures positive page numbers", async () => {
    const { validatePage } = await import("@/lib/db/pagination");
    expect(validatePage(1)).toBe(1);
    expect(validatePage(0)).toBe(1);
    expect(validatePage(-5)).toBe(1);
  });

  test("validateLimit enforces max limit", async () => {
    const { validateLimit } = await import("@/lib/db/pagination");
    expect(validateLimit(20)).toBe(20);
    expect(validateLimit(200, 100)).toBe(100);
    expect(validateLimit(-10)).toBe(20); // default
  });

  test("createPaginationMeta generates metadata", async () => {
    const { createPaginationMeta } = await import("@/lib/db/pagination");
    const meta = createPaginationMeta({
      page: 2,
      limit: 20,
      total: 100,
    });

    expect(meta.page).toBe(2);
    expect(meta.limit).toBe(20);
    expect(meta.total).toBe(100);
    expect(meta.totalPages).toBe(5);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPreviousPage).toBe(true);
  });
});
