import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("lib/core/feed-parser additional coverage", () => {
  test("toPendingArticle maps RSS item to pending article format", async () => {
    const { toPendingArticle } = await import("@/lib/core/parser");

    const item = {
      content: "<p>Content</p>",
      contentSnippet: "Content",
      link: "https://example.com/article",
      pubDate: "2024-01-01T00:00:00Z",
      title: "Test Article",
    };

    const result = toPendingArticle(item, 1, new Date());

    expect(result).not.toBeNull();
    if (result) {
      expect(result.title).toBe("Test Article");
      expect(result.link).toBe("https://example.com/article");
      expect(result.feedId).toBe(1);
    }
  });

  test("toPendingArticle rejects items with invalid links", async () => {
    const { toPendingArticle } = await import("@/lib/core/parser");

    const item = {
      link: "javascript:alert(1)",
      pubDate: "2024-01-01T00:00:00Z",
      title: "Test",
    };

    const result = toPendingArticle(item, 1, new Date());
    expect(result).toBeNull();
  });

  test("toPendingArticle rejects items without links", async () => {
    const { toPendingArticle } = await import("@/lib/core/parser");

    const item = {
      pubDate: "2024-01-01T00:00:00Z",
      title: "Test",
    };

    const result = toPendingArticle(item, 1, new Date());
    expect(result).toBeNull();
  });
});
