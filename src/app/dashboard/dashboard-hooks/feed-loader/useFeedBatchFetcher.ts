"use client";

import { type QueryClient } from "@tanstack/react-query";
import { type RefObject, useCallback } from "react";

import type { Article, ArticleFilter, CategoryTreeNode } from "@/lib/core";

import {
  clearStaleFeedBeforeRefresh,
  type FeedBatchRequestHelpers,
  finishFeedBatchRequest,
  loadFeedBatchResultsOrReturnNull,
  logFeedBatchStart,
  logStaleFeedBatchRequest,
  prepareFeedBatchRequestContext,
} from "@/app/dashboard/dashboard-hooks/feed-loader/feedBatchRequestContext";
import { applyFeedBatchResults } from "@/app/dashboard/dashboard-hooks/feed-loader/feedBatchResultApply";
import { useFeedBatchQuery } from "@/app/dashboard/dashboard-hooks/feed-loader/useFeedBatchQuery";
import { useFeedBatchRequestState } from "@/app/dashboard/dashboard-hooks/feed-loader/useFeedBatchRequestState";
import {
  findFeedNodeByUrl,
  getAllFeedNodes,
} from "@/app/dashboard/dashboard-services/category-tree";
import {
  type FeedBatchSource,
  mapFeedNodesToBatchSources,
} from "@/app/dashboard/dashboard-services/feed-data/batch";
import { type FeedFetchOptions } from "@/app/dashboard/dashboard-services/selection";

type FeedBatchFetcherHookOptions = Omit<
  FeedBatchRequestExecutionOptions,
  "options" | "sources"
>;

interface FeedBatchRequestExecutionOptions {
  articleFilter: ArticleFilter;
  feedRef: RefObject<Article[]>;
  lastFetchedAtByUrlRef: RefObject<Map<string, Date>>;
  loadBatchResults: ReturnType<typeof useFeedBatchQuery>["loadBatchResults"];
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void;
  onFeedBatchLoaded?: (timestamp: Date) => void;
  onNewArticlesArrived?: (newArticleKeys: ReadonlySet<string>) => void;
  options?: FeedFetchOptions;
  queryClient: QueryClient;
  requestHelpers: FeedBatchRequestHelpers;
  requestState: ReturnType<typeof useFeedBatchRequestState>;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<null | string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  sources: FeedBatchSource[];
  usePlaceholderData: boolean;
}

interface FeedRequestCancellationOptions {
  cancelPendingRequest: ReturnType<
    typeof useFeedBatchRequestState
  >["cancelPendingRequest"];
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void;
}

interface FeedSelectionFetchersOptions {
  categoriesRef: RefObject<CategoryTreeNode[]>;
  fetchFeedBatch: (
    sources: FeedBatchSource[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
}
interface FeedSelectionPrefetchersOptions {
  categoriesRef: RefObject<CategoryTreeNode[]>;
  prefetchFeedBatch: ReturnType<typeof useFeedBatchQuery>["prefetchFeedBatch"];
}

interface PreparedFeedBatchRequestOptions {
  context: NonNullable<ReturnType<typeof prepareFeedBatchExecution>>;
  feedRef: FeedBatchFetcherHookOptions["feedRef"];
  lastFetchedAtByUrlRef: FeedBatchFetcherHookOptions["lastFetchedAtByUrlRef"];
  loadBatchResults: FeedBatchFetcherHookOptions["loadBatchResults"];
  logRefreshDiagnostics: FeedBatchFetcherHookOptions["logRefreshDiagnostics"];
  onFeedBatchLoaded?: FeedBatchFetcherHookOptions["onFeedBatchLoaded"];
  onNewArticlesArrived?: FeedBatchFetcherHookOptions["onNewArticlesArrived"];
  /**
   * Snapshot of articles captured before clearStaleFeedBeforeRefresh ran.
   * Used to restore visible content when a transient error (e.g. 504) clears
   * the feed but the subsequent fetch fails to replace it.
   */
  preClearSnapshot: Article[];
  requestState: ReturnType<typeof useFeedBatchRequestState>;
  setExpandedArticleKey: FeedBatchFetcherHookOptions["setExpandedArticleKey"];
  setFeed: FeedBatchFetcherHookOptions["setFeed"];
  usePlaceholderData: FeedBatchFetcherHookOptions["usePlaceholderData"];
}
interface PrepareFeedBatchExecutionOptions {
  articleFilter: ArticleFilter;
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void;
  options?: FeedFetchOptions;
  queryClient: QueryClient;
  requestHelpers: FeedBatchRequestHelpers;
  requestState: ReturnType<typeof useFeedBatchRequestState>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  sources: FeedBatchSource[];
  usePlaceholderData: boolean;
}

interface RestorePreparedFeedBatchSnapshotOnErrorOptions {
  batchResults: Awaited<
    ReturnType<ReturnType<typeof useFeedBatchQuery>["loadBatchResults"]>
  > | null;
  context: PreparedFeedBatchRequestOptions["context"];
  feedRef: PreparedFeedBatchRequestOptions["feedRef"];
  logRefreshDiagnostics: PreparedFeedBatchRequestOptions["logRefreshDiagnostics"];
  preClearSnapshot: PreparedFeedBatchRequestOptions["preClearSnapshot"];
  requestState: PreparedFeedBatchRequestOptions["requestState"];
  setFeed: PreparedFeedBatchRequestOptions["setFeed"];
}
/**
 * Manage the feed batch fetcher.
 * @param options - The options used to manage the feed batch fetcher.
 * @returns The feed batch fetcher state and callbacks.
 */
export function useFeedBatchFetcher(options: FeedBatchFetcherHookOptions) {
  const {
    articleFilter,
    feedRef,
    lastFetchedAtByUrlRef,
    loadBatchResults,
    logRefreshDiagnostics,
    onFeedBatchLoaded,
    onNewArticlesArrived,
    queryClient,
    requestHelpers,
    requestState,
    setExpandedArticleKey,
    setFeed,
    usePlaceholderData,
  } = options;
  return useCallback(
    async (sources: FeedBatchSource[], options?: FeedFetchOptions) =>
      runFeedBatchRequest({
        articleFilter,
        feedRef,
        lastFetchedAtByUrlRef,
        loadBatchResults,
        logRefreshDiagnostics,
        onFeedBatchLoaded,
        onNewArticlesArrived,
        options,
        queryClient,
        requestHelpers,
        requestState,
        setExpandedArticleKey,
        setFeed,
        sources,
        usePlaceholderData,
      }),
    [
      articleFilter,
      feedRef,
      lastFetchedAtByUrlRef,
      loadBatchResults,
      logRefreshDiagnostics,
      onFeedBatchLoaded,
      onNewArticlesArrived,
      queryClient,
      requestHelpers,
      requestState,
      setExpandedArticleKey,
      setFeed,
      usePlaceholderData,
    ],
  );
}

/**
 * Manage the feed request cancellation.
 * @param options - The options used to manage the feed request cancellation.
 * @returns The feed request cancellation state and callbacks.
 */
export function useFeedRequestCancellation(
  options: FeedRequestCancellationOptions,
) {
  const { cancelPendingRequest, logRefreshDiagnostics } = options;
  return useCallback(() => {
    const requestId = cancelPendingRequest();
    logRefreshDiagnostics("refresh:forced-reset", { requestId });
  }, [cancelPendingRequest, logRefreshDiagnostics]);
}

/**
 * Manage the feed selection fetchers.
 * @param options - The options used to manage the feed selection fetchers.
 * @returns The feed selection fetchers state and callbacks.
 */
export function useFeedSelectionFetchers(
  options: FeedSelectionFetchersOptions,
) {
  const { categoriesRef, fetchFeedBatch } = options;
  const fetchFeed = useCallback(
    async (url: string, options?: FeedFetchOptions) => {
      const sourceName = findFeedNodeByUrl(categoriesRef.current, url)?.label;
      await fetchFeedBatch([{ name: sourceName, url }], options);
    },
    [categoriesRef, fetchFeedBatch],
  );
  const fetchCategoryFeeds = useCallback(
    async (categoryNode: CategoryTreeNode, options?: FeedFetchOptions) => {
      await fetchFeedBatch(
        mapFeedNodesToBatchSources(categoryNode.children ?? []),
        options,
      );
    },
    [fetchFeedBatch],
  );
  const fetchAllFeeds = useCallback(
    async (
      sourceCategories?: CategoryTreeNode[],
      options?: FeedFetchOptions,
    ) => {
      const resolvedCategories = sourceCategories ?? categoriesRef.current;
      await fetchFeedBatch(
        mapFeedNodesToBatchSources(getAllFeedNodes(resolvedCategories)),
        options,
      );
    },
    [categoriesRef, fetchFeedBatch],
  );

  return { fetchAllFeeds, fetchCategoryFeeds, fetchFeed };
}
/**
 * Manage the feed selection prefetchers.
 * @param options - The options used to manage the feed selection prefetchers.
 * @returns The feed selection prefetchers state and callbacks.
 */
export function useFeedSelectionPrefetchers(
  options: FeedSelectionPrefetchersOptions,
) {
  const { categoriesRef, prefetchFeedBatch } = options;
  const prefetchFeed = useCallback(
    async (url: string, options?: FeedFetchOptions) => {
      const sourceName = findFeedNodeByUrl(categoriesRef.current, url)?.label;
      await prefetchFeedBatch([{ name: sourceName, url }], options);
    },
    [categoriesRef, prefetchFeedBatch],
  );
  const prefetchCategoryFeeds = useCallback(
    async (categoryNode: CategoryTreeNode, options?: FeedFetchOptions) => {
      await prefetchFeedBatch(
        mapFeedNodesToBatchSources(categoryNode.children ?? []),
        options,
      );
    },
    [prefetchFeedBatch],
  );
  const prefetchAllFeeds = useCallback(
    async (
      sourceCategories?: CategoryTreeNode[],
      options?: FeedFetchOptions,
    ) => {
      const resolvedCategories = sourceCategories ?? categoriesRef.current;
      await prefetchFeedBatch(
        mapFeedNodesToBatchSources(getAllFeedNodes(resolvedCategories)),
        options,
      );
    },
    [categoriesRef, prefetchFeedBatch],
  );

  return { prefetchAllFeeds, prefetchCategoryFeeds, prefetchFeed };
}

/**
 * Process the apply prepared feed batch request.
 * @param options - The options used to process the apply prepared feed batch request.
 */
async function applyPreparedFeedBatchRequest(
  options: PreparedFeedBatchRequestOptions,
) {
  try {
    const batchResults = await loadFeedBatchResultsOrReturnNull(
      options.context,
      options.loadBatchResults,
      options.logRefreshDiagnostics,
    );

    if (
      restorePreparedFeedBatchSnapshotOnError({
        batchResults,
        context: options.context,
        feedRef: options.feedRef,
        logRefreshDiagnostics: options.logRefreshDiagnostics,
        preClearSnapshot: options.preClearSnapshot,
        requestState: options.requestState,
        setFeed: options.setFeed,
      })
    ) {
      return;
    }

    if (
      shouldSkipPreparedFeedBatchRequest(
        batchResults,
        options.context.requestId,
        options.requestState,
      )
    ) {
      logStaleFeedBatchRequest(
        options.logRefreshDiagnostics,
        options.context.requestId,
        batchResults,
      );
      return;
    }

    applyFeedBatchResults({
      batchResults,
      context: options.context,
      feedRef: options.feedRef,
      lastFetchedAtByUrlRef: options.lastFetchedAtByUrlRef,
      logRefreshDiagnostics: options.logRefreshDiagnostics,
      onFeedBatchLoaded: options.onFeedBatchLoaded,
      onNewArticlesArrived: options.onNewArticlesArrived,
      setExpandedArticleKey: options.setExpandedArticleKey,
      setFeed: options.setFeed,
      usePlaceholderData: options.usePlaceholderData,
    });
  } finally {
    finishFeedBatchRequest(
      options.requestState,
      options.logRefreshDiagnostics,
      options.context.requestId,
    );
  }
}
/**
 * Process the prepare feed batch execution.
 * @param options - The options used to process the prepare feed batch execution.
 * @returns The prepare feed batch execution.
 */
function prepareFeedBatchExecution(options: PrepareFeedBatchExecutionOptions) {
  const {
    articleFilter,
    logRefreshDiagnostics,
    options,
    queryClient,
    requestHelpers,
    requestState,
    setFeed,
    sources,
    usePlaceholderData,
  } = options;
  const context = prepareFeedBatchRequestContext({
    articleFilter,
    options,
    queryClient,
    requestHelpers,
    requestState,
    sources,
    usePlaceholderData,
  });

  if (!context) {
    return null;
  }

  logFeedBatchStart(logRefreshDiagnostics, context, sources.length, options);
  clearStaleFeedBeforeRefresh(context, queryClient, setFeed);

  return context;
}

/**
 * Process the restore prepared feed batch snapshot on error.
 * @param options - The options used to process the restore prepared feed batch snapshot on error.
 * @returns Whether restore prepared feed batch snapshot on error.
 */
function restorePreparedFeedBatchSnapshotOnError(
  options: RestorePreparedFeedBatchSnapshotOnErrorOptions,
) {
  const {
    batchResults,
    context,
    feedRef,
    logRefreshDiagnostics,
    preClearSnapshot,
    requestState,
    setFeed,
  } = options;
  if (
    batchResults !== null ||
    !requestState.isCurrentFeedRequest(context.requestId)
  ) {
    return false;
  }

  if (feedRef.current.length === 0 && preClearSnapshot.length > 0) {
    setFeed(preClearSnapshot);
    logRefreshDiagnostics("refresh:error-feed-restored", {
      requestId: context.requestId,
      restoredCount: preClearSnapshot.length,
    });
  }

  return true;
}

/**
 * Process the run feed batch request.
 * @param options - The options used to process the run feed batch request.
 */
async function runFeedBatchRequest(options: FeedBatchRequestExecutionOptions) {
  const {
    articleFilter,
    feedRef,
    lastFetchedAtByUrlRef,
    loadBatchResults,
    logRefreshDiagnostics,
    onFeedBatchLoaded,
    onNewArticlesArrived,
    options,
    queryClient,
    requestHelpers,
    requestState,
    setExpandedArticleKey,
    setFeed,
    sources,
    usePlaceholderData,
  } = options;
  // Capture the article snapshot before prepareFeedBatchExecution calls
  // clearStaleFeedBeforeRefresh, which may call setFeed([]). In production
  // React batches the state update so feedRef still reflects the old articles
  // until the next render. In tests with synchronous setFeed mocks, the mock
  // updates feedRef immediately — capturing here (before the call) handles both.
  const preClearSnapshot = feedRef.current;

  const context = prepareFeedBatchExecution({
    articleFilter,
    logRefreshDiagnostics,
    options,
    queryClient,
    requestHelpers,
    requestState,
    setFeed,
    sources,
    usePlaceholderData,
  });

  if (!context) return;

  await applyPreparedFeedBatchRequest({
    context,
    feedRef,
    lastFetchedAtByUrlRef,
    loadBatchResults,
    logRefreshDiagnostics,
    onFeedBatchLoaded,
    onNewArticlesArrived,
    // Snapshot captured before prepareFeedBatchExecution → clearStaleFeedBeforeRefresh
    // ran, so it reliably holds the articles that were visible before the clear.
    preClearSnapshot,
    requestState,
    setExpandedArticleKey,
    setFeed,
    usePlaceholderData,
  });
}

/**
 * Return whether should skip prepared feed batch request.
 * @param batchResults - The batch results.
 * @param requestId - The request id.
 * @param requestState - The request state.
 * @returns Whether should skip prepared feed batch request.
 */
function shouldSkipPreparedFeedBatchRequest(
  batchResults: Awaited<
    ReturnType<ReturnType<typeof useFeedBatchQuery>["loadBatchResults"]>
  >,
  requestId: number,
  requestState: ReturnType<typeof useFeedBatchRequestState>,
) {
  return !batchResults || !requestState.isCurrentFeedRequest(requestId);
}
