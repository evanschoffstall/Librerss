/**
 * Unit Tests: Database Layer
 * Tests for src/lib/db/
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
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
  test("isUniqueConstraintError detects unique violations", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    const uniqueError = { code: "23505" } as any;
    const otherError = { code: "23503" } as any;

    expect(isUniqueConstraintError(uniqueError)).toBe(true);
    expect(isUniqueConstraintError(otherError)).toBe(false);
  });

  test("isForeignKeyError detects foreign key violations", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    const fkError = { code: "23503" } as any;
    const otherError = { code: "23505" } as any;

    expect(isForeignKeyError(fkError)).toBe(true);
    expect(isForeignKeyError(otherError)).toBe(false);
  });

  test("isUniqueConstraintError handles null error", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    expect(isUniqueConstraintError(null)).toBe(false);
  });

  test("isUniqueConstraintError handles undefined error", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    expect(isUniqueConstraintError(undefined)).toBe(false);
  });

  test("isUniqueConstraintError handles non-object error", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    expect(isUniqueConstraintError("error string")).toBe(false);
    expect(isUniqueConstraintError(123)).toBe(false);
  });

  test("isForeignKeyError handles null error", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    expect(isForeignKeyError(null)).toBe(false);
  });

  test("isForeignKeyError handles undefined error", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    expect(isForeignKeyError(undefined)).toBe(false);
  });

  test("isForeignKeyError handles non-object error", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    expect(isForeignKeyError("error string")).toBe(false);
    expect(isForeignKeyError(123)).toBe(false);
  });

  test("isUniqueConstraintError handles object without code", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    expect(isUniqueConstraintError({})).toBe(false);
  });

  test("isForeignKeyError handles object without code", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    expect(isForeignKeyError({})).toBe(false);
  });
});
