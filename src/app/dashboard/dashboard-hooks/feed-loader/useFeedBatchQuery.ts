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

interface UseFeedBatchQueryOptions {
  articleFilter: FeedFetchOptions["articleFilter"];
  buildRequestSignature: FeedBatchRequestHelpers["buildRequestSignature"];
  getKnownLastFetchedAtByUrl: FeedBatchRequestHelpers["getKnownLastFetchedAtByUrl"];
  queryClient: QueryClient;
  usePlaceholderData: boolean;
}

/**
 * Builds and executes TanStack queries for dashboard feed batches.
 *
 * The feed loader owns batch semantics, while this hook owns query option
 * construction, prefetch reuse, stale times, and normalized toast handling.
 * @param root0
 * @param root0.articleFilter
 * @param root0.buildRequestSignature
 * @param root0.getKnownLastFetchedAtByUrl
 * @param root0.queryClient
 * @param root0.usePlaceholderData
 */
export function useFeedBatchQuery({
  articleFilter,
  buildRequestSignature,
  getKnownLastFetchedAtByUrl,
  queryClient,
  usePlaceholderData,
}: UseFeedBatchQueryOptions): FeedBatchQueryState {
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
 * @param root0
 * @param root0.articleFilter
 * @param root0.buildRequestSignature
 * @param root0.getKnownLastFetchedAtByUrl
 * @param root0.normalizedSources
 * @param root0.options
 */
function buildPrefetchBatchRequest({
  articleFilter,
  buildRequestSignature,
  getKnownLastFetchedAtByUrl,
  normalizedSources,
  options,
}: {
  articleFilter: FeedFetchOptions["articleFilter"];
  buildRequestSignature: UseFeedBatchQueryOptions["buildRequestSignature"];
  getKnownLastFetchedAtByUrl: UseFeedBatchQueryOptions["getKnownLastFetchedAtByUrl"];
  normalizedSources: FeedBatchSource[];
  options?: FeedFetchOptions;
}) {
  const knownLastFetchedAtByUrl = getKnownLastFetchedAtByUrl(
    normalizedSources,
    options?.keepExistingFeed === true,
  );
  const requestSignature = buildRequestSignature(
    normalizedSources,
    options?.articleLimit,
    options?.searchTerm,
  );

  return {
    knownLastFetchedAtByUrl,
    queryKey: getFeedBatchQueryKey(requestSignature, {
      articleFilter,
      articleLimit: options?.articleLimit,
      knownLastFetchedAtByUrl,
      searchTerm: options?.searchTerm,
      skipRefresh: options?.skipRefresh,
    }),
  };
}

/**
 * @param options
 * @param options.articleFilter
 * @param options.buildFeedBatchQueryOptions
 * @param options.buildRequestSignature
 * @param options.getKnownLastFetchedAtByUrl
 * @param options.queryClient
 * @param options.usePlaceholderData
 */
function useFeedBatchPrefetch(options: {
  articleFilter: FeedFetchOptions["articleFilter"];
  buildFeedBatchQueryOptions: ReturnType<
    typeof useFeedBatchQueryOptionsBuilder
  >;
  buildRequestSignature: UseFeedBatchQueryOptions["buildRequestSignature"];
  getKnownLastFetchedAtByUrl: UseFeedBatchQueryOptions["getKnownLastFetchedAtByUrl"];
  queryClient: QueryClient;
  usePlaceholderData: boolean;
}) {
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
        options: requestOptions,
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
 * @param root0
 * @param root0.articleFilter
 * @param root0.usePlaceholderData
 */
function useFeedBatchQueryOptionsBuilder({
  articleFilter,
  usePlaceholderData,
}: Pick<UseFeedBatchQueryOptions, "articleFilter" | "usePlaceholderData">) {
  return useCallback(
    (
      normalizedSources: FeedBatchSource[],
      queryKey: FeedBatchQueryKey,
      options?: FeedFetchOptions,
    ) => ({
      /**
       * @param root0
       * @param root0.signal
       */
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        resolveFeedBatchResults(
          normalizedSources,
          usePlaceholderData,
          {
            ...options,
            articleFilter,
          },
          signal,
        ),
      queryKey,
      staleTime: resolveFeedBatchStaleTime(options),
    }),
    [articleFilter, usePlaceholderData],
  );
}
