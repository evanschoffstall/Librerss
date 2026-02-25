/**
 * Unit Tests: Database Layer
 * Tests for src/lib/db/
 */

import { describe, expect, test } from "bun:test";

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
    const { sanitizeDbError } = await import("@/lib/db/db-errors");
    const error = new Error("connection failed: password=secret123");
    const sanitized = sanitizeDbError(error);
    expect(sanitized.message).not.toContain("secret123");
  });

  test("isUniqueConstraintError detects unique violations", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db-errors");
    const uniqueError = { code: "23505" } as any;
    const otherError = { code: "23503" } as any;

    expect(isUniqueConstraintError(uniqueError)).toBe(true);
    expect(isUniqueConstraintError(otherError)).toBe(false);
  });

  test("isForeignKeyError detects foreign key violations", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db-errors");
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
