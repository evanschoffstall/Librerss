"use client";

import type { FeedBatchRequestContext } from "@/app/dashboard/dashboard-hooks/feed-loader/feedBatchRequestContext";
import type { useFeedBatchQuery } from "@/app/dashboard/dashboard-hooks/feed-loader/useFeedBatchQuery";
import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import {
  buildFeedBatchOutcome,
  formatFeedFailureLabel,
} from "@/app/dashboard/dashboard-services/feed-data/batch";
import {
  mergeHydratedContent,
  notifyFeedFailures,
  resolveExpandedArticleKey,
  shouldNotifyFeedFailureToast,
  summarizeBatchResults,
} from "@/app/dashboard/dashboard-services/feed-loader-state";
import { getPlaceholderArticlesForSource } from "@/lib/core";

/**
 * Describes the options for apply feed batch outcome metadata.
 */
interface ApplyFeedBatchOutcomeMetadataOptions {
  batchResults: NonNullable<BatchResults>;
  capturedOutcome: ReturnType<typeof buildFeedBatchOutcome>;
  context: FeedBatchRequestContext;
  lastFetchedAtByUrlRef: React.RefObject<Map<string, Date>>;
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void;
  onFeedBatchLoaded?: (timestamp: Date) => void;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<null | string>>;
}
/**
 * Describes the options for apply feed batch results.
 */
interface ApplyFeedBatchResultsOptions {
  batchResults: BatchResults;
  context: FeedBatchRequestContext;
  feedRef: React.RefObject<Article[]>;
  lastFetchedAtByUrlRef: React.RefObject<Map<string, Date>>;
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void;
  onFeedBatchLoaded?: (timestamp: Date) => void;
  onNewArticlesArrived?: (newArticleKeys: ReadonlySet<string>) => void;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<null | string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  usePlaceholderData: boolean;
}

/**
 * Defines the batch results type.
 */
type BatchResults = Awaited<
  ReturnType<ReturnType<typeof useFeedBatchQuery>["loadBatchResults"]>
>;
/**
 * Process the apply feed batch results.
 * @param options - The options used to process the apply feed batch results.
 */
export function applyFeedBatchResults(options: ApplyFeedBatchResultsOptions) {
  const {
    batchResults,
    context,
    feedRef,
    lastFetchedAtByUrlRef,
    logRefreshDiagnostics,
    onFeedBatchLoaded,
    onNewArticlesArrived,
    setExpandedArticleKey,
    setFeed,
    usePlaceholderData,
  } = options;
  if (!batchResults || context.skippedDuplicate) {
    return;
  }

  logRefreshDiagnostics("refresh:batch-response", {
    requestId: context.requestId,
    ...summarizeBatchResults(batchResults),
  });

  const capturedOutcome = captureFeedBatchOutcome(
    batchResults,
    context,
    feedRef,
    usePlaceholderData,
  );

  notifyNewlyArrivedArticles(
    capturedOutcome.articles,
    context.keepExistingFeed,
    feedRef,
    onNewArticlesArrived,
  );
  setFeed((currentFeed) =>
    mergeHydratedContent(currentFeed, capturedOutcome.articles, {
      preserveLocalFeedState: context.keepExistingFeed,
    }),
  );
  applyFeedBatchOutcomeMetadata({
    batchResults,
    capturedOutcome,
    context,
    lastFetchedAtByUrlRef,
    logRefreshDiagnostics,
    onFeedBatchLoaded,
    setExpandedArticleKey,
  });
}

/**
 * Process the apply feed batch outcome metadata.
 * @param options - The options used to process the apply feed batch outcome metadata.
 */
function applyFeedBatchOutcomeMetadata(
  options: ApplyFeedBatchOutcomeMetadataOptions,
) {
  const {
    batchResults,
    capturedOutcome,
    context,
    lastFetchedAtByUrlRef,
    logRefreshDiagnostics,
    onFeedBatchLoaded,
    setExpandedArticleKey,
  } = options;
  const { articles, failedFeeds, newestLastFetchedAt, sourceNamesByUrl } =
    capturedOutcome;

  if (newestLastFetchedAt) {
    onFeedBatchLoaded?.(newestLastFetchedAt);
  }
  syncLastFetchedAtByUrl(lastFetchedAtByUrlRef, batchResults);

  if (shouldNotifyFeedFailureToast(context.options, context.isBackground)) {
    notifyFeedFailures(
      failedFeeds,
      batchResults.length,
      sourceNamesByUrl,
      formatFeedFailureLabel,
    );
  }

  if (articles.length > 0) {
    setExpandedArticleKey((currentKey) =>
      resolveExpandedArticleKey(currentKey, articles),
    );
    logRefreshDiagnostics("refresh:applied", {
      articleCount: articles.length,
      requestId: context.requestId,
    });
    return;
  }

  logRefreshDiagnostics("refresh:empty-after-map", {
    requestId: context.requestId,
  });
}

/**
 * Process the capture feed batch outcome.
 * @param batchResults - The batch results.
 * @param context - The context used to process the capture feed batch outcome.
 * @param feedRef - The ref that stores the feed ref.
 * @param usePlaceholderData - The placeholder data.
 * @returns The capture feed batch outcome.
 */
function captureFeedBatchOutcome(
  batchResults: NonNullable<BatchResults>,
  context: FeedBatchRequestContext,
  feedRef: React.RefObject<Article[]>,
  usePlaceholderData: boolean,
) {
  return buildFeedBatchOutcome(
    context.normalizedSources,
    batchResults,
    usePlaceholderData,
    getPlaceholderArticlesForSource,
    context.keepExistingFeed ? feedRef.current : [],
    context.articleSortOrder,
  );
}

/**
 * Process the notify newly arrived articles.
 * @param articles - The articles.
 * @param keepExistingFeed - The keep existing feed.
 * @param feedRef - The ref that stores the feed ref.
 * @param onNewArticlesArrived - Callback invoked when new articles arrive from a completed batch fetch.
 */
function notifyNewlyArrivedArticles(
  articles: Article[],
  keepExistingFeed: boolean,
  feedRef: React.RefObject<Article[]>,
  onNewArticlesArrived?: (newArticleKeys: ReadonlySet<string>) => void,
) {
  if (
    !keepExistingFeed ||
    feedRef.current.length === 0 ||
    !onNewArticlesArrived
  ) {
    return;
  }

  const existingKeys = new Set(feedRef.current.map(getArticleKey));
  const newKeys = new Set(
    articles
      .filter((article) => !existingKeys.has(getArticleKey(article)))
      .map(getArticleKey),
  );
  if (newKeys.size > 0) {
    onNewArticlesArrived(newKeys);
  }
}

/**
 * Process the sync last fetched at by url.
 * @param lastFetchedAtByUrlRef - The ref that stores the last fetched at by url ref.
 * @param batchResults - The batch results.
 */
function syncLastFetchedAtByUrl(
  lastFetchedAtByUrlRef: React.RefObject<Map<string, Date>>,
  batchResults: NonNullable<BatchResults>,
) {
  for (const result of batchResults) {
    if (result.lastFetchedAt) {
      lastFetchedAtByUrlRef.current.set(result.url, result.lastFetchedAt);
    }
  }
}
