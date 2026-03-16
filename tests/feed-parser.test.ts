import { describe, expect, test } from "bun:test";
import Parser from "rss-parser";

describe("RSS Parser content:encoded handling", () => {
  test("should parse content:encoded into item.content", async () => {
    // Sample RSS with content:encoded (like motherjones uses)
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Test Article</title>
      <link>https://example.com/article</link>
      <description>Short description snippet.</description>
      <content:encoded><![CDATA[<p>This is the full article content with HTML markup and much more detail than the description field provides. It should be significantly longer and contain the actual article body.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

    const parser = new Parser({
      customFields: {
        item: [["content:encoded", "contentEncoded", { keepArray: false }]],
      },
    });

    const feed = await parser.parseString(rssXml);
    const item = feed.items[0];

    // content:encoded should be in contentEncoded custom field
    expect(typeof item.contentEncoded).toBe("string");
    expect(item.contentEncoded.length).toBeGreaterThan(100);
    expect(item.contentEncoded).toContain("full article content");
    expect(item.contentEncoded).toContain("<p>");
  });

  test("should fallback to contentSnippet when content:encoded is missing", async () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Test Article</title>
      <link>https://example.com/article</link>
      <description>Only a description.</description>
    </item>
  </channel>
</rss>`;

    const parser = new Parser({
      customFields: {
        item: [["content:encoded", "contentEncoded", { keepArray: false }]],
      },
    });

    const feed = await parser.parseString(rssXml);
    const item = feed.items[0];

    // Should fallback to contentSnippet
    expect(typeof item.contentSnippet).toBe("string");
    expect(item.contentSnippet).toBe("Only a description.");
  });
});
