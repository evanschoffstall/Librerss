import type { getDb } from "@/lib/db/db";

import { CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";

import type { FeedUpstreamTransport } from "./feed-http";

import { type RefreshDecision } from "./feed-batch-pipeline.types";
import {
  type FeedRecord,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
  type UpstreamRefreshResult,
} from "./feed-refresh";

/** Builds the per-feed refresh plan for a batch request. */
export function buildRefreshPlan(
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
  skipRefresh: boolean,
  forceRefresh: boolean,
  forceResolveUpstream = false,
): RefreshDecision[] {
  return allowedUrls.map((url) => {
    const feed = feedByUrl.get(url);
    if (!feed) {
      return { decision: "missing-feed-record", url };
    }
    if (skipRefresh) {
      return { decision: "skip-refresh-flag", url };
    }

    if (forceResolveUpstream) {
      return {
        decision: "refresh-upstream-override",
        lastFetched: feed.lastFetched,
        url,
      };
    }

    const isStale = shouldRefreshFeed(feed.lastFetched);
    const canForceRefresh = shouldForceRefreshFeed(feed.lastFetched);

    if (forceRefresh && (canForceRefresh || feed.lastFetchError !== null)) {
      return { decision: "refresh-force", lastFetched: feed.lastFetched, url };
    }
    if (forceRefresh && !canForceRefresh) {
      return {
        decision: "force-cooldown-use-cache",
        lastFetched: feed.lastFetched,
        url,
      };
    }

    return {
      decision: isStale ? "refresh-stale" : "use-cache",
      lastFetched: feed.lastFetched,
      url,
    };
  });
}

/**
 * Runs all upstream refresh work with bounded concurrency and merges persisted errors.
 *
 * The returned maps drive both diagnostics and cached fallback behavior for the
 * batch fetcher that orchestrates these lower-level refreshes.
 */
export async function executeParallelRefreshes(
  db: ReturnType<typeof getDb>,
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
  skipRefresh: boolean,
  forceRefresh: boolean,
  forceResolveUpstream = false,
  proxyTransport?: FeedUpstreamTransport,
): Promise<{
  cooldownLimitedCount: number;
  errors: Map<string, string>;
  refreshedCount: number;
  refreshedUrls: Set<string>;
}> {
  const upstreamErrors = new Map<string, string>();
  const refreshedUrls = new Set<string>();
  let cooldownLimitedCount = 0;

  if (!skipRefresh) {
    const canRefresh = (feed: FeedRecord): boolean => {
      if (forceResolveUpstream) {
        return true;
      }

      if (forceRefresh) {
        return (
          shouldForceRefreshFeed(feed.lastFetched) ||
          feed.lastFetchError !== null
        );
      }

      return shouldRefreshFeed(feed.lastFetched);
    };

    const staleFeeds = allowedUrls
      .map((url) => feedByUrl.get(url))
      .filter((feed): feed is FeedRecord => feed !== undefined && canRefresh(feed));

    for (const feed of staleFeeds) {
      refreshedUrls.add(feed.url);
    }

    if (forceRefresh && !forceResolveUpstream) {
      cooldownLimitedCount = allowedUrls.filter((url) => {
        const feed = feedByUrl.get(url);
        return (
          feed !== undefined &&
          !shouldForceRefreshFeed(feed.lastFetched) &&
          feed.lastFetchError === null
        );
      }).length;
    }

    if (staleFeeds.length > 0) {
      const results = await settledWithConcurrency(
        staleFeeds.map((feed) => () =>
          refreshFeedFromUpstream(db, feed, {
            proxyTransport,
          }),
        ),
        CONFIG.FEED_BATCH_CONCURRENCY,
      );

      for (const [index, settlement] of results.entries()) {
        const url = staleFeeds[index]?.url;
        if (!url) {
          continue;
        }

        if (settlement.status === "fulfilled") {
          const result: UpstreamRefreshResult = settlement.value;
          if (!result.ok) {
            upstreamErrors.set(url, result.error);
          }
          continue;
        }

        const reason =
          settlement.reason instanceof Error
            ? settlement.reason.message
            : String(settlement.reason);
        upstreamErrors.set(url, reason);
        logger.warn("Unexpected refresh settlement rejection", {
          reason,
          url,
        });
      }
    }
  }

  for (const url of allowedUrls) {
    if (upstreamErrors.has(url)) {
      continue;
    }
    const feed = feedByUrl.get(url);
    if (feed?.lastFetchError) {
      upstreamErrors.set(url, feed.lastFetchError);
    }
  }

  return {
    cooldownLimitedCount,
    errors: upstreamErrors,
    refreshedCount: refreshedUrls.size,
    refreshedUrls,
  };
}

async function settledWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results = [] as PromiseSettledResult<T>[];
  results.length = tasks.length;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const taskIndex = nextIndex++;
      try {
        results[taskIndex] = {
          status: "fulfilled",
          value: await tasks[taskIndex](),
        };
      } catch (reason) {
        results[taskIndex] = { reason, status: "rejected" };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return results;
}