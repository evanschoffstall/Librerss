import { CONFIG, logger } from "@/lib";

import type { FeedUpstreamTransport } from "./http-client";

import { type RefreshDecision } from "./batch-types";
import {
  type FeedRecord,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
  type UpstreamRefreshResult,
} from "./refresher";

type DbMod = typeof import("@/lib/db");

/**
 * Runs all upstream refresh work with bounded concurrency and merges persisted errors.
 *
 * The returned maps drive both diagnostics and cached fallback behavior for the
 * batch fetcher that orchestrates these lower-level refreshes.
 */
interface ExecuteParallelRefreshesOptions {
  allowedUrls: string[];
  db: ReturnType<DbMod["getDb"]>;
  feedByUrl: Map<string, FeedRecord>;
  forceRefresh: boolean;
  forceResolveUpstream?: boolean;
  proxyTransport?: FeedUpstreamTransport;
  skipRefresh: boolean;
}

/**
 * Builds the per-feed refresh plan for a batch request.
 * @param feedByUrl
 * @param allowedUrls
 * @param skipRefresh
 * @param forceRefresh
 * @param forceResolveUpstream
 */
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
 * @param root0
 * @param root0.allowedUrls
 * @param root0.db
 * @param root0.feedByUrl
 * @param root0.forceRefresh
 * @param root0.forceResolveUpstream
 * @param root0.proxyTransport
 * @param root0.skipRefresh
 */
export async function executeParallelRefreshes({
  allowedUrls,
  db,
  feedByUrl,
  forceRefresh,
  forceResolveUpstream = false,
  proxyTransport,
  skipRefresh,
}: ExecuteParallelRefreshesOptions): Promise<{
  cooldownLimitedCount: number;
  errors: Map<string, string>;
  refreshedCount: number;
  refreshedUrls: Set<string>;
}> {
  const upstreamErrors = new Map<string, string>();
  const refreshedUrls = new Set<string>();
  const cooldownLimitedCount = countCooldownLimitedFeeds(
    feedByUrl,
    allowedUrls,
    forceRefresh,
    forceResolveUpstream,
  );

  if (!skipRefresh) {
    const staleFeeds = resolveRefreshCandidates(
      feedByUrl,
      allowedUrls,
      forceRefresh,
      forceResolveUpstream,
    );

    for (const feed of staleFeeds) {
      refreshedUrls.add(feed.url);
    }

    if (staleFeeds.length > 0) {
      const results = await refreshCandidateFeeds(
        db,
        staleFeeds,
        proxyTransport,
      );
      recordRefreshSettlements(staleFeeds, results, upstreamErrors);
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

/**
 * @param feedByUrl
 * @param allowedUrls
 * @param forceRefresh
 * @param forceResolveUpstream
 */
function countCooldownLimitedFeeds(
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
  forceRefresh: boolean,
  forceResolveUpstream: boolean,
): number {
  if (!forceRefresh || forceResolveUpstream) {
    return 0;
  }

  return allowedUrls.filter((url) => {
    const feed = feedByUrl.get(url);
    return (
      feed !== undefined &&
      !shouldForceRefreshFeed(feed.lastFetched) &&
      feed.lastFetchError === null
    );
  }).length;
}

/**
 * @param staleFeeds
 * @param results
 * @param upstreamErrors
 */
function recordRefreshSettlements(
  staleFeeds: FeedRecord[],
  results: PromiseSettledResult<UpstreamRefreshResult>[],
  upstreamErrors: Map<string, string>,
): void {
  for (const [index, settlement] of results.entries()) {
    const url = staleFeeds[index]?.url;
    if (!url) {
      continue;
    }

    if (settlement.status === "fulfilled") {
      if (!settlement.value.ok) {
        upstreamErrors.set(url, settlement.value.error);
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

/**
 * @param db
 * @param staleFeeds
 * @param proxyTransport
 */
async function refreshCandidateFeeds(
  db: ReturnType<DbMod["getDb"]>,
  staleFeeds: FeedRecord[],
  proxyTransport: FeedUpstreamTransport | undefined,
): Promise<PromiseSettledResult<UpstreamRefreshResult>[]> {
  return settledWithConcurrency(
    staleFeeds.map(
      (feed) => () =>
        refreshFeedFromUpstream(db, feed, {
          proxyTransport,
        }),
    ),
    CONFIG.FEED_BATCH_CONCURRENCY,
  );
}

/**
 * @param feedByUrl
 * @param allowedUrls
 * @param forceRefresh
 * @param forceResolveUpstream
 */
function resolveRefreshCandidates(
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
  forceRefresh: boolean,
  forceResolveUpstream: boolean,
): FeedRecord[] {
  return allowedUrls
    .map((url) => feedByUrl.get(url))
    .filter(
      (feed): feed is FeedRecord =>
        feed !== undefined &&
        shouldBatchRefreshFeed(feed, forceRefresh, forceResolveUpstream),
    );
}

/**
 * @param tasks
 * @param concurrency
 */
async function settledWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results = [] as PromiseSettledResult<T>[];
  results.length = tasks.length;
  let nextIndex = 0;

  /**
   *
   */
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

/**
 * @param feed
 * @param forceRefresh
 * @param forceResolveUpstream
 */
function shouldBatchRefreshFeed(
  feed: FeedRecord,
  forceRefresh: boolean,
  forceResolveUpstream: boolean,
): boolean {
  if (forceResolveUpstream) {
    return true;
  }

  if (forceRefresh) {
    return (
      shouldForceRefreshFeed(feed.lastFetched) || feed.lastFetchError !== null
    );
  }

  return shouldRefreshFeed(feed.lastFetched);
}
