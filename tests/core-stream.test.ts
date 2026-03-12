/**
 * Tests for stream-conditions, shared response helpers, and stream ID helpers.
 * No module mocking — all tested via static imports.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { notFoundResponse, textResponse } from "@/lib/api/http";
import { buildStreamConditions } from "@/lib/core/stream-conditions";
import { parseUserLabel, USER_LABEL_PREFIX } from "@/lib/core/stream-ids";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

// ─── stream-conditions: buildStreamConditions ─────────────────────────────────

describe("buildStreamConditions", () => {
  test("returns empty conditions for reading-list without filters", () => {
    const conditions = buildStreamConditions({
      continuationId: null,
      dateFilter: null,
      feedUrl: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions).toEqual([]);
  });

  test("adds feed URL condition", () => {
    const conditions = buildStreamConditions({
      continuationId: null,
      dateFilter: null,
      feedUrl: "https://example.com/feed",
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("adds date-only filter", () => {
    const conditions = buildStreamConditions({
      continuationId: null,
      dateFilter: new Date("2024-01-01"),
      feedUrl: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("combines feedUrl and dateFilter conditions", () => {
    const conditions = buildStreamConditions({
      continuationId: null,
      dateFilter: new Date("2024-01-01"),
      feedUrl: "https://example.com/feed",
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("adds starred condition when useArticleStatuses is true", () => {
    const conditions = buildStreamConditions({
      continuationId: null,
      dateFilter: null,
      feedUrl: null,
      starredOnly: true,
      useArticleStatuses: true,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("does not add starred condition when useArticleStatuses is false", () => {
    const conditions = buildStreamConditions({
      continuationId: null,
      dateFilter: null,
      feedUrl: null,
      starredOnly: true,
      useArticleStatuses: false,
    });
    expect(conditions).toEqual([]);
  });

  test("adds excludeRead filter when useArticleStatuses is true", () => {
    const conditions = buildStreamConditions({
      continuationId: null,
      dateFilter: null,
      excludeRead: true,
      feedUrl: null,
      starredOnly: false,
      useArticleStatuses: true,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("does not add excludeRead when useArticleStatuses is false", () => {
    const conditions = buildStreamConditions({
      continuationId: null,
      dateFilter: null,
      excludeRead: true,
      feedUrl: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions).toEqual([]);
  });

  test("adds continuation condition", () => {
    const conditions = buildStreamConditions({
      continuationId: 100,
      dateFilter: null,
      feedUrl: null,
      starredOnly: false,
      useArticleStatuses: false,
    });
    expect(conditions.length).toBeGreaterThan(0);
  });

  test("combines all filters", () => {
    const conditions = buildStreamConditions({
      continuationId: 50,
      dateFilter: new Date("2024-01-01"),
      excludeRead: true,
      feedUrl: "https://example.com/feed",
      starredOnly: true,
      useArticleStatuses: true,
    });
    // Should have: feedUrl+dateFilter combo, starredOnly, excludeRead, continuationId
    expect(conditions.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Shared responses ─────────────────────────────────────────────────────────

describe("shared responses", () => {
  test("textResponse returns correct status and content-type", async () => {
    const res = textResponse("OK\n");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toBe("OK\n");
  });

  test("textResponse with custom status", () => {
    const res = textResponse("Error\n", 400);
    expect(res.status).toBe(400);
  });

  test("notFoundResponse returns 404 JSON", async () => {
    const res = notFoundResponse();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });
});
// ─── Stream IDs ───────────────────────────────────────────────────────────────

describe("stream IDs", () => {
  test("parseUserLabel extracts label from prefix", () => {
    expect(parseUserLabel(`${USER_LABEL_PREFIX}Tech`)).toBe("Tech");
    expect(parseUserLabel("not-a-label")).toBeNull();
    expect(parseUserLabel("")).toBeNull();
  });
});
