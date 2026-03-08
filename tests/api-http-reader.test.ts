import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("lib/api/reader-api", () => {
  test("parseReaderStreamItems extracts items array from response", async () => {
    const { parseReaderStreamItems } = await import("@/lib/api/http");

    const response = {
      items: [
        { id: "item1", title: "Test Article" },
        { id: "item2", title: "Another Article" },
      ],
    };

    const result = parseReaderStreamItems(response);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Test Article");
  });

  test("parseReaderStreamItems returns empty array for undefined response", async () => {
    const { parseReaderStreamItems } = await import("@/lib/api/http");

    const result = parseReaderStreamItems(undefined);
    expect(result).toEqual([]);
  });

  test("parseReaderStreamItems returns empty array when items is not array", async () => {
    const { parseReaderStreamItems } = await import("@/lib/api/http");

    const result = parseReaderStreamItems({ items: "not-an-array" } as any);
    expect(result).toEqual([]);
  });

  test("readerItemToArticle converts reader item to article format", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      id: "tag:google.com,2005:reader/item/abc123",
      title: "Test Article",
      published: 1640000000,
      canonical: [{ href: "https://example.com/article" }],
      summary: { content: "<p>Article content here</p>" },
      origin: {
        streamId: "feed/https://example.com/feed.xml",
        title: "Example Feed",
        htmlUrl: "https://example.com",
      },
      categories: ["user/-/state/com.google/read"],
    };

    const result = readerItemToArticle(item, 0);

    expect(result.title).toBe("Test Article");
    expect(result.link).toBe("https://example.com/article");
    expect(result.content).toBe("<p>Article content here</p>");
    expect(result.feedName).toBe("Example Feed");
    expect(result.feedUrl).toBe("https://example.com");
    expect(result.isRead).toBe(true);
    expect(result.isStarred).toBe(false);
  });

  test("readerItemToArticle uses alternate link when canonical is missing", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      alternate: [{ href: "https://example.com/alt" }],
    };

    const result = readerItemToArticle(item, 5);
    expect(result.link).toBe("https://example.com/alt");
  });

  test("readerItemToArticle uses fallback link when both canonical and alternate missing", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {};

    const result = readerItemToArticle(item, 10);
    expect(result.link).toBe("about:reader-item-10");
  });

  test("readerItemToArticle uses updated timestamp when published is missing", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      updated: 1650000000,
    };

    const result = readerItemToArticle(item, 0);
    expect(result.publicationDate.getTime()).toBe(1650000000000);
  });

  test("readerItemToArticle detects starred state from categories", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      categories: ["user/-/state/com.google/starred"],
    };

    const result = readerItemToArticle(item, 0);
    expect(result.isStarred).toBe(true);
    expect(result.isRead).toBe(false);
  });

  test("readerItemToArticle extracts feed URL from streamId", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      origin: {
        streamId: "feed/https://blog.example.com/rss",
      },
    };

    const result = readerItemToArticle(item, 0);
    expect(result.feedUrl).toBe("https://blog.example.com/rss");
  });

  test("readerItemToArticle handles missing origin gracefully", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      title: "No Origin",
    };

    const result = readerItemToArticle(item, 0);
    expect(result.feedName).toBeUndefined();
    expect(result.feedUrl).toBeUndefined();
  });

  test("readerItemToArticle sanitizes tiny placeholder images from summary content", async () => {
    const { readerItemToArticle } = await import("@/lib/api/http");

    const item = {
      title: "Placeholder",
      canonical: [{ href: "https://example.com/article" }],
      summary: {
        content:
          '<img style="display:block" src="https://static.files.bbci.co.uk/grey-placeholder.png" width="150" height="84" /><p>Body remains</p>',
      },
    };

    const result = readerItemToArticle(item, 0);
    expect(result.content).not.toContain("grey-placeholder.png");
    expect(result.content).toContain("Body remains");
  });
});
