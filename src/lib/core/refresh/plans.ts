import type { FeedUpstreamTransport } from "@/lib/core/feed-http";

import { CONFIG, logger } from "@/lib";
import {
  type FeedRecord,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
  type UpstreamRefreshResult,
} from "@/lib/core/refresh";
import {
  resolveFeedBatchConcurrency,
  resolveFeedBatchRefreshBudgetMs,
  resolveFeedRequestTimeoutMs,
} from "@/lib/feed-refresh-runtime";

/** Refresh plan entry describing whether a feed should refresh or use cache. */
export interface RefreshDecision {
  decision:
    | "force-cooldown-use-cache"
    | "missing-feed-record"
    | "refresh-force"
    | "refresh-stale"
    | "refresh-upstream-override"
    | "skip-refresh-flag"
    | "use-cache";
  lastFetched?: Date;
  url: string;
}

/** Describes a normalized refresh error payload returned to batch callers. */
interface BatchFeedError {
  message: string;
  statusCode?: number;
}

export const BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE =
  "Batch refresh budget exhausted before feed refresh started";

/**
 * Defines the DB mod type.
 */
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
  nowFn?: () => number;
  proxyTransport?: FeedUpstreamTransport;
  proxyTransportError?: string;
  skipRefresh: boolean;
}

/** Describes refresh candidates after removing feeds blocked by proxy configuration errors. */
interface RefreshCandidatePartition {
  blockedProxyFeeds: FeedRecord[];
  refreshableFeeds: FeedRecord[];
}

/** Describes mutable refresh execution state accumulated for one batch. */
interface RefreshExecutionState {
  refreshedUrls: Set<string>;
  upstreamErrors: Map<string, BatchFeedError>;
}

/** Describes options for bounded task settlement. */
interface SettledWithConcurrencyOptions {
  createSkippedReason?: () => unknown;
  shouldStartTask?: () => boolean;
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
  errors: Map<string, BatchFeedError>;
  refreshedCount: number;
  refreshedUrls: Set<string>;
}> {
  const {
    allowedUrls,
    feedByUrl,
    forceRefresh,
    forceResolveUpstream = false,
    skipRefresh,
  } = options;
  const upstreamErrors = new Map<string, BatchFeedError>();
  const refreshedUrls = new Set<string>();
  const cooldownLimitedCount = countCooldownLimitedFeeds(
    feedByUrl,
    allowedUrls,
    forceRefresh,
    forceResolveUpstream,
  );

  if (!skipRefresh) {
    await executeRefreshCandidates(options, {
      refreshedUrls,
      upstreamErrors,
    });
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
  upstreamErrors: Map<string, BatchFeedError>,
): void {
  for (const url of allowedUrls) {
    if (upstreamErrors.has(url)) {
      continue;
    }

    const feed = feedByUrl.get(url);
    if (feed?.lastFetchError) {
      upstreamErrors.set(url, { message: feed.lastFetchError });
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
 * Execute stale feed refresh candidates and record per-feed outcomes.
 * @param options - Batch refresh options.
 * @param state - Mutable refresh outcome state.
 */
async function executeRefreshCandidates(
  options: ExecuteParallelRefreshesOptions,
  state: RefreshExecutionState,
): Promise<void> {
  const staleFeeds = resolveRefreshCandidates(
    options.feedByUrl,
    options.allowedUrls,
    options.forceRefresh,
    options.forceResolveUpstream ?? false,
  );
  if (staleFeeds.length === 0) return;

  const { blockedProxyFeeds, refreshableFeeds } =
    partitionRefreshCandidatesByProxyAvailability(
      staleFeeds,
      options.proxyTransport,
      options.proxyTransportError,
    );
  recordProxyTransportErrors(
    blockedProxyFeeds,
    options.proxyTransportError,
    state.upstreamErrors,
  );

  const results = await refreshCandidateFeeds(
    options.db,
    refreshableFeeds,
    options.proxyTransport,
    options.nowFn ?? Date.now,
  );
  recordRefreshSettlements(
    refreshableFeeds,
    results,
    state.upstreamErrors,
    state.refreshedUrls,
  );
}

/**
 * Return whether a refresh settlement represents an intentional budget skip.
 * @param settlement - The refresh settlement to inspect.
 * @returns Whether the refresh was skipped before starting.
 */
function isBatchRefreshBudgetSkipped(
  settlement: PromiseSettledResult<UpstreamRefreshResult>,
): boolean {
  return (
    settlement.status === "rejected" &&
    settlement.reason instanceof Error &&
    settlement.reason.message === BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE
  );
}

/**
 * Split refresh candidates so a broken saved proxy cannot force proxy-enabled feeds onto direct egress.
 * @param staleFeeds - Feed records selected for an upstream refresh.
 * @param proxyTransport - Materialized proxy transport, when credentials are usable.
 * @param proxyTransportError - Error captured while materializing saved proxy settings.
 * @returns Refreshable feeds plus proxy-enabled feeds blocked by proxy setup failure.
 */
function partitionRefreshCandidatesByProxyAvailability(
  staleFeeds: FeedRecord[],
  proxyTransport: FeedUpstreamTransport | undefined,
  proxyTransportError: string | undefined,
): RefreshCandidatePartition {
  if (proxyTransportError === undefined || proxyTransport !== undefined) {
    return { blockedProxyFeeds: [], refreshableFeeds: staleFeeds };
  }

  const blockedProxyFeeds: FeedRecord[] = [];
  const refreshableFeeds: FeedRecord[] = [];

  for (const feed of staleFeeds) {
    if (feed.proxyEnabled === true) {
      blockedProxyFeeds.push(feed);
      continue;
    }

    refreshableFeeds.push(feed);
  }

  return { blockedProxyFeeds, refreshableFeeds };
}

/**
 * Record per-feed proxy setup failures without attempting unsafe direct fallback for those feeds.
 * @param blockedProxyFeeds - Proxy-enabled feeds that could not receive materialized proxy credentials.
 * @param proxyTransportError - User-actionable proxy setup error.
 * @param upstreamErrors - Mutable batch error map keyed by feed URL.
 */
function recordProxyTransportErrors(
  blockedProxyFeeds: FeedRecord[],
  proxyTransportError: string | undefined,
  upstreamErrors: Map<string, BatchFeedError>,
): void {
  if (proxyTransportError === undefined) {
    return;
  }

  for (const feed of blockedProxyFeeds) {
    upstreamErrors.set(feed.url, { message: proxyTransportError });
  }
}

/**
 * Record refresh outcomes as successful starts, upstream errors, or budget skips.
 * @param staleFeeds - Feed records aligned by index with the settlement array.
 * @param results - Settled refresh results returned by the concurrency runner.
 * @param upstreamErrors - Mutable map that receives per-feed refresh errors.
 * @param refreshedUrls - Mutable set that receives URLs whose refresh work actually started.
 */
function recordRefreshSettlements(
  staleFeeds: FeedRecord[],
  results: PromiseSettledResult<UpstreamRefreshResult>[],
  upstreamErrors: Map<string, BatchFeedError>,
  refreshedUrls: Set<string>,
): void {
  for (const [index, settlement] of results.entries()) {
    const url = staleFeeds[index]?.url;
    if (!url) {
      continue;
    }

    if (isBatchRefreshBudgetSkipped(settlement)) {
      upstreamErrors.set(url, {
        message: BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE,
      });
      continue;
    }

    refreshedUrls.add(url);

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
    upstreamErrors.set(url, { message: reason });
    logger.warn("Unexpected refresh settlement rejection", {
      reason,
      url,
    });
  }
}

/**
 * Refresh candidate feeds while respecting runtime-specific start budgets.
 * @param db - Database client used by individual feed refreshes.
 * @param staleFeeds - Feed records selected for upstream refresh.
 * @param proxyTransport - Optional proxy transport for proxy-enabled feeds.
 * @param nowFn - Clock used to decide whether starting another refresh is still safe.
 * @returns Settled refresh results aligned with the input feed order.
 */
async function refreshCandidateFeeds(
  db: ReturnType<DbMod["getDb"]>,
  staleFeeds: FeedRecord[],
  proxyTransport: FeedUpstreamTransport | undefined,
  nowFn: () => number,
): Promise<PromiseSettledResult<UpstreamRefreshResult>[]> {
  const latestStartAt = resolveLatestBatchRefreshStartAt(nowFn());
  return settledWithConcurrency(
    staleFeeds.map(
      (feed) => () =>
        refreshFeedFromUpstream(db, feed, {
          proxyTransport,
        }),
    ),
    resolveFeedBatchConcurrency(CONFIG.FEED_BATCH_CONCURRENCY),
    {
      /**
       * Return the standardized per-feed error for a skipped refresh.
       * @returns Error used as the skipped refresh settlement reason.
       */
      createSkippedReason: () =>
        new Error(BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE),
      /**
       * Return whether enough batch budget remains to start another refresh.
       * @returns Whether a worker may start the next feed refresh.
       */
      shouldStartTask: () => nowFn() <= latestStartAt,
    },
  );
}

/**
 * Resolve the latest safe wall-clock time for starting another feed refresh.
 * @param startedAt - Batch refresh start timestamp.
 * @returns The latest safe task start timestamp.
 */
function resolveLatestBatchRefreshStartAt(startedAt: number): number {
  const budgetMs = resolveFeedBatchRefreshBudgetMs();
  if (!Number.isFinite(budgetMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return (
    startedAt +
    Math.max(
      0,
      budgetMs - resolveFeedRequestTimeoutMs(CONFIG.FEED_REQUEST_TIMEOUT_MS),
    )
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
 * Run promise-returning tasks with a bounded number of workers.
 * @param tasks - Task factories to execute.
 * @param concurrency - Maximum number of workers to run at once.
 * @param options - Optional hooks for skipping work before a task starts.
 * @returns Settled task results aligned with the input task order.
 */
async function settledWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  options?: SettledWithConcurrencyOptions,
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
      if (options?.shouldStartTask && !options.shouldStartTask()) {
        results[taskIndex] = {
          reason:
            options.createSkippedReason?.() ??
            new Error(BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE),
          status: "rejected",
        };
        continue;
      }

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
