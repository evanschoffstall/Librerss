import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import Parser from "rss-parser";

const IFL_SCIENCE_ATOM_UPDATED_ITEM_XML = `
<rss version="2.0" xmlns:a10="http://www.w3.org/2005/Atom">
  <channel>
    <item>
      <guid isPermaLink="false">the-moon-illusion-still-hasnt-been-solved-after-thousands-of-years-83384</guid>
      <link>https://www.iflscience.com/the-moon-illusion-still-hasnt-been-solved-after-thousands-of-years-83384</link>
      <title>The Moon Illusion Still Hasn't Been Solved After Thousands Of Years</title>
      <description>NASA takes a surprisingly chill approach to the dilemma.</description>
      <a10:updated>2026-05-01T15:28:44Z</a10:updated>
      <a10:content type="html"><![CDATA[ ]]></a10:content>
    </item>
  </channel>
</rss>`;

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

  test("toPendingArticle uses namespaced Atom updated dates when RSS pubDate is absent", async () => {
    const { FEED_PARSER_CUSTOM_FIELDS, toPendingArticle } = await import(
      "@/lib/core/parser"
    );
    const parser = new Parser({ customFields: FEED_PARSER_CUSTOM_FIELDS });
    const parsedFeed = await parser.parseString(IFL_SCIENCE_ATOM_UPDATED_ITEM_XML);

    const result = toPendingArticle(
      parsedFeed.items[0]!,
      1,
      new Date("2026-05-03T17:10:00.000Z"),
    );

    expect(result).not.toBeNull();
    expect(result?.publicationDate.toISOString()).toBe(
      "2026-05-01T15:28:44.000Z",
    );
  });

  test("toPendingArticle prefers Atom published dates over updated dates", async () => {
    const { toPendingArticle } = await import("@/lib/core/parser");

    const result = toPendingArticle(
      {
        atomPublished: "2026-05-01T12:00:00.000Z",
        atomUpdated: "2026-05-02T12:00:00.000Z",
        link: "https://example.com/article",
        title: "Atom Article",
      },
      1,
      new Date("2026-05-03T17:10:00.000Z"),
    );

    expect(result).not.toBeNull();
    expect(result?.publicationDate.toISOString()).toBe(
      "2026-05-01T12:00:00.000Z",
    );
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
