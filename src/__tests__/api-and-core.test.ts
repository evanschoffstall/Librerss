import { describe, expect, test } from "bun:test";

describe("lib/api/reader-api", () => {
  test("parseReaderStreamItems extracts items array from response", async () => {
    const { parseReaderStreamItems } = await import("@/lib/api/reader-mappers");

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
    const { parseReaderStreamItems } = await import("@/lib/api/reader-mappers");

    const result = parseReaderStreamItems(undefined);
    expect(result).toEqual([]);
  });

  test("parseReaderStreamItems returns empty array when items is not array", async () => {
    const { parseReaderStreamItems } = await import("@/lib/api/reader-mappers");

    const result = parseReaderStreamItems({ items: "not-an-array" } as any);
    expect(result).toEqual([]);
  });

  test("readerItemToArticle converts reader item to article format", async () => {
    const { readerItemToArticle } = await import("@/lib/api/reader-mappers");

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
    const { readerItemToArticle } = await import("@/lib/api/reader-mappers");

    const item = {
      alternate: [{ href: "https://example.com/alt" }],
    };

    const result = readerItemToArticle(item, 5);
    expect(result.link).toBe("https://example.com/alt");
  });

  test("readerItemToArticle uses fallback link when both canonical and alternate missing", async () => {
    const { readerItemToArticle } = await import("@/lib/api/reader-mappers");

    const item = {};

    const result = readerItemToArticle(item, 10);
    expect(result.link).toBe("about:reader-item-10");
  });

  test("readerItemToArticle uses updated timestamp when published is missing", async () => {
    const { readerItemToArticle } = await import("@/lib/api/reader-mappers");

    const item = {
      updated: 1650000000,
    };

    const result = readerItemToArticle(item, 0);
    expect(result.publicationDate.getTime()).toBe(1650000000000);
  });

  test("readerItemToArticle detects starred state from categories", async () => {
    const { readerItemToArticle } = await import("@/lib/api/reader-mappers");

    const item = {
      categories: ["user/-/state/com.google/starred"],
    };

    const result = readerItemToArticle(item, 0);
    expect(result.isStarred).toBe(true);
    expect(result.isRead).toBe(false);
  });

  test("readerItemToArticle extracts feed URL from streamId", async () => {
    const { readerItemToArticle } = await import("@/lib/api/reader-mappers");

    const item = {
      origin: {
        streamId: "feed/https://blog.example.com/rss",
      },
    };

    const result = readerItemToArticle(item, 0);
    expect(result.feedUrl).toBe("https://blog.example.com/rss");
  });

  test("readerItemToArticle handles missing origin gracefully", async () => {
    const { readerItemToArticle } = await import("@/lib/api/reader-mappers");

    const item = {
      title: "No Origin",
    };

    const result = readerItemToArticle(item, 0);
    expect(result.feedName).toBeUndefined();
    expect(result.feedUrl).toBeUndefined();
  });

  test("readerItemToArticle sanitizes tiny placeholder images from summary content", async () => {
    const { readerItemToArticle } = await import("@/lib/api/reader-mappers");

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

describe("lib/auth/csrf additional coverage", () => {
  test("requireSameOrigin allows same-origin requests with origin header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "https://example.com",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).toBeNull();
  });

  test("requireSameOrigin blocks cross-origin requests with origin header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "https://evil.com",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.status).toBe(403);
    }
  });

  test("requireSameOrigin allows same-origin requests with referer header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        referer: "https://example.com/page",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).toBeNull();
  });

  test("requireSameOrigin blocks cross-origin requests with referer header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        referer: "https://evil.com/page",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });

  test("requireSameOrigin blocks when Sec-Fetch-Site indicates cross-site", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        "sec-fetch-site": "cross-site",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });

  test("requireSameOrigin allows when Sec-Fetch-Site is same-origin", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        "sec-fetch-site": "same-origin",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).toBeNull();
  });

  test("requireSameOrigin blocks when host header is missing", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });

  test("requireSameOrigin handles malformed origin gracefully", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "not-a-valid-url",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });
});

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
