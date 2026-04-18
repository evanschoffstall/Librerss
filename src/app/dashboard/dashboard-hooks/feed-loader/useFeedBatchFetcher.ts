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

export function useFeedBatchFetcher({
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
}: FeedBatchFetcherHookOptions) {
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

export function useFeedRequestCancellation({
  cancelPendingRequest,
  logRefreshDiagnostics,
}: {
  cancelPendingRequest: ReturnType<
    typeof useFeedBatchRequestState
  >["cancelPendingRequest"];
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void;
}) {
  return useCallback(() => {
    const requestId = cancelPendingRequest();
    logRefreshDiagnostics("refresh:forced-reset", { requestId });
  }, [cancelPendingRequest, logRefreshDiagnostics]);
}

export function useFeedSelectionFetchers({
  categoriesRef,
  fetchFeedBatch,
}: {
  categoriesRef: RefObject<CategoryTreeNode[]>;
  fetchFeedBatch: (
    sources: FeedBatchSource[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
}) {
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

export function useFeedSelectionPrefetchers({
  categoriesRef,
  prefetchFeedBatch,
}: {
  categoriesRef: RefObject<CategoryTreeNode[]>;
  prefetchFeedBatch: ReturnType<typeof useFeedBatchQuery>["prefetchFeedBatch"];
}) {
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

function prepareFeedBatchExecution({
  articleFilter,
  logRefreshDiagnostics,
  options,
  queryClient,
  requestHelpers,
  requestState,
  setFeed,
  sources,
  usePlaceholderData,
}: {
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
}) {
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

function restorePreparedFeedBatchSnapshotOnError({
  batchResults,
  context,
  feedRef,
  logRefreshDiagnostics,
  preClearSnapshot,
  requestState,
  setFeed,
}: {
  batchResults: Awaited<
    ReturnType<ReturnType<typeof useFeedBatchQuery>["loadBatchResults"]>
  > | null;
  context: PreparedFeedBatchRequestOptions["context"];
  feedRef: PreparedFeedBatchRequestOptions["feedRef"];
  logRefreshDiagnostics: PreparedFeedBatchRequestOptions["logRefreshDiagnostics"];
  preClearSnapshot: PreparedFeedBatchRequestOptions["preClearSnapshot"];
  requestState: PreparedFeedBatchRequestOptions["requestState"];
  setFeed: PreparedFeedBatchRequestOptions["setFeed"];
}) {
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

async function runFeedBatchRequest({
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
}: FeedBatchRequestExecutionOptions) {
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

function shouldSkipPreparedFeedBatchRequest(
  batchResults: Awaited<
    ReturnType<ReturnType<typeof useFeedBatchQuery>["loadBatchResults"]>
  >,
  requestId: number,
  requestState: ReturnType<typeof useFeedBatchRequestState>,
) {
  return !batchResults || !requestState.isCurrentFeedRequest(requestId);
}
