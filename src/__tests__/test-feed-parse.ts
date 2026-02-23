/**
 * Test script to verify RSS parser reads content:encoded correctly
 * Run: bun run scripts/test-feed-parse.ts
 */

import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded", { keepArray: false }]],
  },
});

const MOTHERJONES_FEED = "https://www.motherjones.com/feed/";

async function testParse() {
  console.log("Fetching motherjones feed...");
  const feed = await parser.parseURL(MOTHERJONES_FEED);

  console.log(`\nParsed ${feed.items.length} items from feed\n`);

  const item = feed.items[0];
  console.log("First article:");
  console.log("  Title:", item.title?.slice(0, 60));
  console.log("  Link:", item.link?.slice(0, 80));
  console.log("  description length:", item.contentSnippet?.length ?? 0);
  console.log(
    "  content:encoded length:",
    (item as any).contentEncoded?.length ?? 0,
  );
  console.log(
    "\n✓ Parser is correctly reading content:encoded:",
    ((item as any).contentEncoded?.length ?? 0) > 1000
      ? "YES (full articles)"
      : "NO (still using excerpts)",
  );
}

testParse().catch(console.error);
