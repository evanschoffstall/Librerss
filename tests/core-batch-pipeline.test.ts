import { expect, test } from "bun:test";
import { buildRefreshPlan } from "../src/lib/core/feed-batch-pipeline";
import type { FeedRecord } from "../src/lib/core/feed-refresh";

test("buildRefreshPlan returns per-feed refresh decisions", () => {
  const skippedFeed: FeedRecord = {
    id: 1,
    url: "https://skip.example/feed.xml",
    lastFetched: new Date(0),
    lastFetchError: null,
  };
  const forceRetryFeed: FeedRecord = {
    id: 2,
    url: "https://retry.example/feed.xml",
    lastFetched: new Date(),
    lastFetchError: "upstream failed",
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
      url: skippedFeed.url,
      decision: "skip-refresh-flag",
    },
    {
      url: "https://missing.example/feed.xml",
      decision: "missing-feed-record",
    },
  ]);

  expect(
    buildRefreshPlan(
      new Map([
        [skippedFeed.url, skippedFeed],
        [forceRetryFeed.url, forceRetryFeed],
      ]),
      [skippedFeed.url, forceRetryFeed.url],
      false,
      true,
    ),
  ).toEqual([
    {
      url: skippedFeed.url,
      decision: "refresh-force",
      lastFetched: skippedFeed.lastFetched,
    },
    {
      url: forceRetryFeed.url,
      decision: "refresh-force",
      lastFetched: forceRetryFeed.lastFetched,
    },
  ]);
});
