import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import Parser from "rss-parser";

const IFL_SCIENCE_ATOM_UPDATED_ITEM_XML = `
<rss version="2.0" xmlns:a10="http://www.w3.org/2005/Atom">
  <channel>
    <item>
      <guid isPermaLink="false">the-moon-illusion-still-hasnt-been-solved-after-thousands-of-years-83384</guid>
      <link>https://example.com/the-moon-illusion-study</link>
      <title>The Moon Illusion Still Hasn't Been Solved After Thousands Of Years</title>
      <description>Researchers describe calibration methods used for the observation.</description>
      <a10:updated>2026-05-01T15:28:44Z</a10:updated>
      <a10:content type="html"><![CDATA[ ]]></a10:content>
    </item>
  </channel>
</rss>`;
const EXAMPLE_ATOM_ID_ONLY_ITEM_XML = `
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Example Journal</title>
  <entry>
    <id>https://example.com/2026/05/workplace-safety-standards</id>
    <title type="text">Workplace Safety Standards Updated for Field Teams</title>
    <updated>2026-05-03T15:56:47.507815Z</updated>
    <published>2026-05-03T15:56:47.507815Z</published>
    <summary type="text">Safety standards summary.</summary>
  </entry>
</feed>`;
const EXAMPLE_NON_PERMALINK_GUID_ITEM_XML = `
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">
  <channel>
    <title><![CDATA[Example Review]]></title>
    <item>
      <title><![CDATA[Research methods in field studies]]></title>
      <link>https://example.com/research/field-study-methods/</link>
      <guid isPermaLink="false">69e88a1d3587c6000194538e</guid>
      <pubDate>Tue, 21 Apr 2026 06:03:51 GMT</pubDate>
      <content:encoded><![CDATA[<p>Example Review full article body.</p>]]></content:encoded>
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
    const { FEED_PARSER_CUSTOM_FIELDS, toPendingArticle } =
      await import("@/lib/core/parser");
    const parser = new Parser({ customFields: FEED_PARSER_CUSTOM_FIELDS });
    const parsedFeed = await parser.parseString(
      IFL_SCIENCE_ATOM_UPDATED_ITEM_XML,
    );

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

  test("toPendingArticle maps Atom id-only entries to article links", async () => {
    const { FEED_PARSER_CUSTOM_FIELDS, toPendingArticle } =
      await import("@/lib/core/parser");
    const parser = new Parser({ customFields: FEED_PARSER_CUSTOM_FIELDS });
    const parsedFeed = await parser.parseString(EXAMPLE_ATOM_ID_ONLY_ITEM_XML);

    const result = toPendingArticle(
      parsedFeed.items[0]!,
      37,
      new Date("2026-05-04T00:07:42.253Z"),
    );

    expect(result).not.toBeNull();
    expect(result?.link).toBe(
      "https://example.com/2026/05/workplace-safety-standards",
    );
    expect(result?.publicationDate.toISOString()).toBe(
      "2026-05-03T15:56:47.507Z",
    );
  });

  test("toPendingArticle keeps RSS links ahead of non-permalink guid values", async () => {
    const { FEED_PARSER_CUSTOM_FIELDS, toPendingArticle } =
      await import("@/lib/core/parser");
    const parser = new Parser({ customFields: FEED_PARSER_CUSTOM_FIELDS });
    const parsedFeed = await parser.parseString(
      EXAMPLE_NON_PERMALINK_GUID_ITEM_XML,
    );

    const result = toPendingArticle(
      parsedFeed.items[0]!,
      38,
      new Date("2026-05-04T00:07:42.253Z"),
    );

    expect(result).not.toBeNull();
    expect(result?.link).toBe(
      "https://example.com/research/field-study-methods/",
    );
    expect(result?.content).toContain("Example Review full article body.");
  });

  test("toPendingArticle maps URL guid items when RSS link is absent", async () => {
    const { toPendingArticle } = await import("@/lib/core/parser");

    const result = toPendingArticle(
      {
        guid: "https://example.com/rss-guid-permalink",
        pubDate: "2026-05-01T12:00:00.000Z",
        title: "RSS guid permalink",
      },
      1,
      new Date("2026-05-03T17:10:00.000Z"),
    );

    expect(result).not.toBeNull();
    expect(result?.link).toBe("https://example.com/rss-guid-permalink");
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
