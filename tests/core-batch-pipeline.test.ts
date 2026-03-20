import { expect, test } from "bun:test";

import type { FeedRecord } from "../src/lib/core/feed-refresh";

import { buildRefreshPlan } from "../src/lib/core/feed-batch-pipeline";

test("buildRefreshPlan returns per-feed refresh decisions", () => {
  const skippedFeed: FeedRecord = {
    id: 1,
    lastFetched: new Date(0),
    lastFetchError: null,
    url: "https://skip.example/feed.xml",
  };
  const forceRetryFeed: FeedRecord = {
    id: 2,
    lastFetched: new Date(),
    lastFetchError: "upstream failed",
    url: "https://retry.example/feed.xml",
  };

  expect(
    buildRefreshPlan(
      new Map([[skippedFeed.url, skippedFeed]]),
      [skippedFeed.url, "https://missing.example/feed.xml"],
      true,
      false,
    ),
  ).toEqual([
    {
      decision: "skip-refresh-flag",
      url: skippedFeed.url,
    },
    {
      decision: "missing-feed-record",
      url: "https://missing.example/feed.xml",
    },
  ]);

  expect(
    buildRefreshPlan(
      new Map([
        [forceRetryFeed.url, forceRetryFeed],
        [skippedFeed.url, skippedFeed],
      ]),
      [skippedFeed.url, forceRetryFeed.url],
      false,
      true,
    ),
  ).toEqual([
    {
      decision: "refresh-force",
      lastFetched: skippedFeed.lastFetched,
      url: skippedFeed.url,
    },
    {
      decision: "refresh-force",
      lastFetched: forceRetryFeed.lastFetched,
      url: forceRetryFeed.url,
    },
  ]);
});

// Regression test: \s in a JS template literal is cooked to "s" by Drizzle's sql
// tag, so the regex sent to PostgreSQL becomes 's+' — matching ALL lowercase 's'
// and replacing them with spaces instead of collapsing whitespace.
// The fix is '\\s+' (escaped backslash) which sends '\s+' to PostgreSQL.
test("SQL whitespace-collapse regex escaping does not strip lowercase s", () => {
  const { sql } = require("drizzle-orm") as typeof import("drizzle-orm");

  // Simulate the actual pattern from queryTopArticlesPerFeed
  const q = sql`regexp_replace(content, '\\s+', ' ', 'g')`;
  // Access query chunks via Drizzle's internal structure
   
  const raw = JSON.stringify((q as any).queryChunks);

  // The SQL must contain literal '\s+' (with backslash) not 's+'
  expect(raw).toContain("\\\\s+");
  expect(raw).not.toMatch(/'s\+'/);
});
