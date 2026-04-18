"use client";

import type { FeedBatchRequestContext } from "@/app/dashboard/dashboard-hooks/feed-loader/feedBatchRequestContext";
import type { Article } from "@/lib/core";

import { useFeedBatchQuery } from "@/app/dashboard/dashboard-hooks/feed-loader/useFeedBatchQuery";
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

type BatchResults = Awaited<
  ReturnType<ReturnType<typeof useFeedBatchQuery>["loadBatchResults"]>
>;

/**
 * @param root0
 * @param root0.batchResults
 * @param root0.context
 * @param root0.feedRef
 * @param root0.lastFetchedAtByUrlRef
 * @param root0.logRefreshDiagnostics
 * @param root0.onFeedBatchLoaded
 * @param root0.onNewArticlesArrived
 * @param root0.setExpandedArticleKey
 * @param root0.setFeed
 * @param root0.usePlaceholderData
 */
export function applyFeedBatchResults({
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
}: {
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
}) {
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
 * @param root0
 * @param root0.batchResults
 * @param root0.capturedOutcome
 * @param root0.context
 * @param root0.lastFetchedAtByUrlRef
 * @param root0.logRefreshDiagnostics
 * @param root0.onFeedBatchLoaded
 * @param root0.setExpandedArticleKey
 */
function applyFeedBatchOutcomeMetadata({
  batchResults,
  capturedOutcome,
  context,
  lastFetchedAtByUrlRef,
  logRefreshDiagnostics,
  onFeedBatchLoaded,
  setExpandedArticleKey,
}: {
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
}) {
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
 * @param batchResults
 * @param context
 * @param feedRef
 * @param usePlaceholderData
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
  );
}

/**
 * @param articles
 * @param keepExistingFeed
 * @param feedRef
 * @param onNewArticlesArrived
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
 * @param lastFetchedAtByUrlRef
 * @param batchResults
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
