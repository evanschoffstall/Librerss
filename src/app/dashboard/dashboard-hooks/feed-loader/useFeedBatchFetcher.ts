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

async function applyPreparedFeedBatchRequest({
  context,
  feedRef,
  lastFetchedAtByUrlRef,
  loadBatchResults,
  logRefreshDiagnostics,
  onFeedBatchLoaded,
  onNewArticlesArrived,
  requestState,
  setExpandedArticleKey,
  setFeed,
  usePlaceholderData,
}: PreparedFeedBatchRequestOptions) {
  try {
    const batchResults = await loadFeedBatchResultsOrReturnNull(
      context,
      loadBatchResults,
      logRefreshDiagnostics,
    );
    if (
      shouldSkipPreparedFeedBatchRequest(
        batchResults,
        context.requestId,
        requestState,
      )
    ) {
      logStaleFeedBatchRequest(
        logRefreshDiagnostics,
        context.requestId,
        batchResults,
      );
      return;
    }

    applyFeedBatchResults({
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
    });
  } finally {
    finishFeedBatchRequest(
      requestState,
      logRefreshDiagnostics,
      context.requestId,
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
