import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("lib/core/feed-parser additional coverage", () => {
  test("toPendingArticle maps RSS item to pending article format", async () => {
    const { toPendingArticle } = await import("@/lib/core/feed-parser");

    const item = {
      title: "Test Article",
      link: "https://example.com/article",
      pubDate: "2024-01-01T00:00:00Z",
      content: "<p>Content</p>",
      contentSnippet: "Content",
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
    const { toPendingArticle } = await import("@/lib/core/feed-parser");

    const item = {
      title: "Test",
      link: "javascript:alert(1)",
      pubDate: "2024-01-01T00:00:00Z",
    };

    const result = toPendingArticle(item, 1, new Date());
    expect(result).toBeNull();
  });

  test("toPendingArticle rejects items without links", async () => {
    const { toPendingArticle } = await import("@/lib/core/feed-parser");

    const item = {
      title: "Test",
      pubDate: "2024-01-01T00:00:00Z",
    };

    const result = toPendingArticle(item, 1, new Date());
    expect(result).toBeNull();
  });
});
