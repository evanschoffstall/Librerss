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
 * Build the refresh plan.
 * @param feedByUrl - The feed by url.
 * @param allowedUrls - The allowed urls.
 * @param skipRefresh - The skip refresh.
 * @param forceRefresh - The force refresh.
 * @param forceResolveUpstream - The force resolve upstream.
 * @returns The refresh plan.
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
 * Process the execute parallel refreshes.
 * @param options - The options used to process the execute parallel refreshes.
 * @returns The execute parallel refreshes.
 */
export async function executeParallelRefreshes(
  options: ExecuteParallelRefreshesOptions,
): Promise<{
  cooldownLimitedCount: number;
  errors: Map<string, string>;
  refreshedCount: number;
  refreshedUrls: Set<string>;
}> {
  const {
    allowedUrls,
    db,
    feedByUrl,
    forceRefresh,
    forceResolveUpstream = false,
    proxyTransport,
    skipRefresh,
  } = options;
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
    trackRefreshedUrls(staleFeeds, refreshedUrls);

    if (staleFeeds.length > 0) {
      const results = await refreshCandidateFeeds(
        db,
        staleFeeds,
        proxyTransport,
      );
      recordRefreshSettlements(staleFeeds, results, upstreamErrors);
    }
  }
  appendPersistedRefreshErrors(feedByUrl, allowedUrls, upstreamErrors);

  return {
    cooldownLimitedCount,
    errors: upstreamErrors,
    refreshedCount: refreshedUrls.size,
    refreshedUrls,
  };
}

/**
 * Merge persisted feed errors for urls that did not fail during this refresh pass.
 * @param feedByUrl - The feed records keyed by url.
 * @param allowedUrls - The urls included in the current batch.
 * @param upstreamErrors - The refresh errors accumulated so far.
 */
function appendPersistedRefreshErrors(
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
  upstreamErrors: Map<string, string>,
): void {
  for (const url of allowedUrls) {
    if (upstreamErrors.has(url)) {
      continue;
    }

    const feed = feedByUrl.get(url);
    if (feed?.lastFetchError) {
      upstreamErrors.set(url, feed.lastFetchError);
    }
  }
}

/**
 * Process the count cooldown limited feeds.
 * @param feedByUrl - The feed by url.
 * @param allowedUrls - The allowed urls.
 * @param forceRefresh - The force refresh.
 * @param forceResolveUpstream - The force resolve upstream.
 * @returns The count cooldown limited feeds.
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
 * Process the record refresh settlements.
 * @param staleFeeds - The stale feeds.
 * @param results - The results.
 * @param upstreamErrors - The upstream errors.
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
 * Process the refresh candidate feeds.
 * @param db - The db.
 * @param staleFeeds - The stale feeds.
 * @param proxyTransport - The proxy transport.
 * @returns The refresh candidate feeds.
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
 * Resolve the refresh candidates.
 * @param feedByUrl - The feed by url.
 * @param allowedUrls - The allowed urls.
 * @param forceRefresh - The force refresh.
 * @param forceResolveUpstream - The force resolve upstream.
 * @returns The refresh candidates.
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
 * Process the settled with concurrency.
 * @param tasks - The callback that tasks.
 * @param concurrency - The concurrency.
 * @returns The settled with concurrency.
 */
async function settledWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results = [] as PromiseSettledResult<T>[];
  results.length = tasks.length;
  let nextIndex = 0;

  /**
   * Process the worker.
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
 * Return whether should batch refresh feed.
 * @param feed - The feed.
 * @param forceRefresh - The force refresh.
 * @param forceResolveUpstream - The force resolve upstream.
 * @returns Whether should batch refresh feed.
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

/**
 * Track the urls that were refreshed during the current batch.
 * @param staleFeeds - The feed records selected for upstream refresh.
 * @param refreshedUrls - The url set that records refreshed feeds.
 */
function trackRefreshedUrls(
  staleFeeds: FeedRecord[],
  refreshedUrls: Set<string>,
): void {
  for (const { url } of staleFeeds) {
    refreshedUrls.add(url);
  }
}
