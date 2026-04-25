"use client";

import { type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import type { FeedBatchRequestHelpers } from "@/app/dashboard/dashboard-hooks/feed-loader/feedBatchRequestContext";

import { getFeedBatchQueryKey } from "@/app/dashboard/dashboard-services";
import {
  type FeedBatchSource,
  normalizeFeedBatchSources,
  resolveFeedBatchResults,
} from "@/app/dashboard/dashboard-services/feed-data/batch";
import {
  classifyFeedBatchError,
  type FeedBatchResult,
  isCanceledBatchRequest,
  isHandledFeedBatchError,
  resolveFeedBatchStaleTime,
} from "@/app/dashboard/dashboard-services/feed-loader-state";
import { type FeedFetchOptions } from "@/app/dashboard/dashboard-services/selection";

interface FeedBatchPrefetchOptions {
  articleFilter: FeedFetchOptions["articleFilter"];
  buildFeedBatchQueryOptions: ReturnType<
    typeof useFeedBatchQueryOptionsBuilder
  >;
  buildRequestSignature: UseFeedBatchQueryOptions["buildRequestSignature"];
  getKnownLastFetchedAtByUrl: UseFeedBatchQueryOptions["getKnownLastFetchedAtByUrl"];
  queryClient: QueryClient;
  usePlaceholderData: boolean;
}

type FeedBatchQueryKey = ReturnType<typeof getFeedBatchQueryKey>;

interface FeedBatchQueryState {
  loadBatchResults: (
    normalizedSources: FeedBatchSource[],
    queryKey: FeedBatchQueryKey,
    options?: FeedFetchOptions,
    silent?: boolean,
  ) => Promise<FeedBatchResult[] | null>;
  prefetchFeedBatch: (
    sources: FeedBatchSource[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
}

interface PrefetchBatchRequestOptions {
  articleFilter: FeedFetchOptions["articleFilter"];
  buildRequestSignature: UseFeedBatchQueryOptions["buildRequestSignature"];
  getKnownLastFetchedAtByUrl: UseFeedBatchQueryOptions["getKnownLastFetchedAtByUrl"];
  normalizedSources: FeedBatchSource[];
  requestOptions?: FeedFetchOptions;
}

interface QueryFnOptions {
  signal: AbortSignal;
}
interface UseFeedBatchQueryOptions {
  articleFilter: FeedFetchOptions["articleFilter"];
  buildRequestSignature: FeedBatchRequestHelpers["buildRequestSignature"];
  getKnownLastFetchedAtByUrl: FeedBatchRequestHelpers["getKnownLastFetchedAtByUrl"];
  queryClient: QueryClient;
  usePlaceholderData: boolean;
}

/**
 * Manage the feed batch query.
 * @param options - The options used to manage the feed batch query.
 * @returns The feed batch query state and callbacks.
 */
export function useFeedBatchQuery(
  options: UseFeedBatchQueryOptions,
): FeedBatchQueryState {
  const {
    articleFilter,
    buildRequestSignature,
    getKnownLastFetchedAtByUrl,
    queryClient,
    usePlaceholderData,
  } = options;
  const buildFeedBatchQueryOptions = useFeedBatchQueryOptionsBuilder({
    articleFilter,
    usePlaceholderData,
  });
  const loadBatchResults = useCallback(
    async (
      normalizedSources: FeedBatchSource[],
      queryKey: FeedBatchQueryKey,
      options?: FeedFetchOptions,
      silent = false,
    ): Promise<FeedBatchResult[] | null> => {
      try {
        if (options?.forceRefresh) {
          queryClient.removeQueries({ exact: true, queryKey });
        }

        return await queryClient.fetchQuery(
          buildFeedBatchQueryOptions(normalizedSources, queryKey, options),
        );
      } catch (error) {
        if (isCanceledBatchRequest(error)) {
          return null;
        }

        if (!isHandledFeedBatchError(error)) {
          console.error("Batch feed fetch error:", error);
        }
        if (!silent) {
          const { description, title } = classifyFeedBatchError(error);
          toast.error(title, { description });
        }
        return null;
      }
    },
    [buildFeedBatchQueryOptions, queryClient],
  );
  const prefetchFeedBatch = useFeedBatchPrefetch({
    articleFilter,
    buildFeedBatchQueryOptions,
    buildRequestSignature,
    getKnownLastFetchedAtByUrl,
    queryClient,
    usePlaceholderData,
  });

  return { loadBatchResults, prefetchFeedBatch };
}
/**
 * Build the prefetch batch request.
 * @param options - The options used to build the prefetch batch request.
 * @returns The prefetch batch request.
 */
function buildPrefetchBatchRequest(options: PrefetchBatchRequestOptions) {
  const {
    articleFilter,
    buildRequestSignature,
    getKnownLastFetchedAtByUrl,
    normalizedSources,
    requestOptions,
  } = options;
  const knownLastFetchedAtByUrl = getKnownLastFetchedAtByUrl(
    normalizedSources,
    requestOptions?.keepExistingFeed === true,
  );
  const requestSignature = buildRequestSignature(
    normalizedSources,
    requestOptions?.articleLimit,
    requestOptions?.searchTerm,
  );

  return {
    knownLastFetchedAtByUrl,
    queryKey: getFeedBatchQueryKey(requestSignature, {
      articleFilter,
      articleLimit: requestOptions?.articleLimit,
      knownLastFetchedAtByUrl,
      searchTerm: requestOptions?.searchTerm,
      skipRefresh: requestOptions?.skipRefresh,
    }),
  };
}

/**
 * Manage the feed batch prefetch.
 * @param options - The options used to manage the feed batch prefetch.
 * @returns The feed batch prefetch state and callbacks.
 */
function useFeedBatchPrefetch(options: FeedBatchPrefetchOptions) {
  const {
    articleFilter,
    buildFeedBatchQueryOptions,
    buildRequestSignature,
    getKnownLastFetchedAtByUrl,
    queryClient,
    usePlaceholderData,
  } = options;

  return useCallback(
    async (sources: FeedBatchSource[], requestOptions?: FeedFetchOptions) => {
      const normalizedSources = normalizeFeedBatchSources(sources);
      if (normalizedSources.length === 0 || usePlaceholderData) {
        return;
      }

      const prefetchRequest = buildPrefetchBatchRequest({
        articleFilter,
        buildRequestSignature,
        getKnownLastFetchedAtByUrl,
        normalizedSources,
        requestOptions,
      });

      await queryClient.prefetchQuery(
        buildFeedBatchQueryOptions(
          normalizedSources,
          prefetchRequest.queryKey,
          {
            ...requestOptions,
            articleFilter,
            articleLimit: requestOptions?.articleLimit,
            knownLastFetchedAtByUrl: prefetchRequest.knownLastFetchedAtByUrl,
            searchTerm: requestOptions?.searchTerm,
          },
        ),
      );
    },
    [
      articleFilter,
      buildFeedBatchQueryOptions,
      buildRequestSignature,
      getKnownLastFetchedAtByUrl,
      queryClient,
      usePlaceholderData,
    ],
  );
}

/**
 * Manage the feed batch query options builder.
 * @param options - The options used to manage the feed batch query options builder.
 * @returns The feed batch query options builder state and callbacks.
 */
function useFeedBatchQueryOptionsBuilder(
  options: Pick<
    UseFeedBatchQueryOptions,
    "articleFilter" | "usePlaceholderData"
  >,
) {
  const { articleFilter, usePlaceholderData } = options;
  return useCallback(
    (
      normalizedSources: FeedBatchSource[],
      queryKey: FeedBatchQueryKey,
      requestOptions?: FeedFetchOptions,
    ) => ({
      /**
       * Process the query fn.
       * @param queryFnOptions - Query execution options supplied by TanStack Query.
       * @returns The query fn.
       */
      queryFn: (queryFnOptions: QueryFnOptions) => {
        const { signal } = queryFnOptions;
        return resolveFeedBatchResults(
          normalizedSources,
          usePlaceholderData,
          {
            ...requestOptions,
            articleFilter,
          },
          signal,
        );
      },
      queryKey,
      staleTime: resolveFeedBatchStaleTime(requestOptions),
    }),
    [articleFilter, usePlaceholderData],
  );
}
