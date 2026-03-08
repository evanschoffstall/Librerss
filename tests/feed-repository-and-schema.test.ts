import { toFeedSourceResponse } from "@/lib/api/feeds/repository";
import * as schema from "@/lib/db/schema";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("toFeedSourceResponse", () => {
  test("defaults empty category to My Feeds", () => {
    const row = { id: 1, name: "F", url: "https://x.com", category: "" };
    const result = toFeedSourceResponse(row);
    expect(result.category).toBe("My Feeds");
  });

  test("defaults null category to My Feeds", () => {
    const row = { id: 1, name: "F", url: "https://x.com", category: null };
    const result = toFeedSourceResponse(row as any);
    expect(result.category).toBe("My Feeds");
  });

  test("trims existing category", () => {
    const row = {
      id: 1,
      name: "F",
      url: "https://x.com",
      category: "  Tech  ",
    };
    const result = toFeedSourceResponse(row);
    expect(result.category).toBe("Tech");
  });

  test("preserves non-empty category", () => {
    const row = { id: 1, name: "F", url: "https://x.com", category: "Tech" };
    const result = toFeedSourceResponse(row);
    expect(result.category).toBe("Tech");
  });
});

// ─── schema: table definitions ────────────────────────────────────────────────

describe("schema tables", () => {
  test("all tables are importable and defined", () => {
    expect(schema.users).toBeDefined();
    expect(schema.sessions).toBeDefined();
    expect(schema.feeds).toBeDefined();
    expect(schema.articles).toBeDefined();
    expect(schema.feedSources).toBeDefined();
    expect(schema.feedCategories).toBeDefined();
    expect(schema.categoryOrders).toBeDefined();
    expect(schema.articleStatuses).toBeDefined();
  });
});
