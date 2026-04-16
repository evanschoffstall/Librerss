"use client";

import { type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

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
  buildRequestSignature: (
    normalizedSources: FeedBatchSource[],
    articleLimit?: FeedFetchOptions["articleLimit"],
  ) => string;
  getKnownLastFetchedAtByUrl: (
    normalizedSources: FeedBatchSource[],
    keepExistingFeed: boolean,
  ) => Map<string, Date> | undefined;
  queryClient: QueryClient;
  usePlaceholderData: boolean;
}

/**
 * Builds and executes TanStack queries for dashboard feed batches.
 *
 * The feed loader owns batch semantics, while this hook owns query option
 * construction, prefetch reuse, stale times, and normalized toast handling.
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

        console.error("Batch feed fetch error:", error);
        if (!silent) {
          const { description, title } = classifyFeedBatchError(error);
          toast.error(title, { description });
        }
        return null;
      }
    },
    [buildFeedBatchQueryOptions, queryClient],
  );
  const prefetchFeedBatch = useCallback(
    async (sources: FeedBatchSource[], options?: FeedFetchOptions) => {
      const normalizedSources = normalizeFeedBatchSources(sources);
      if (normalizedSources.length === 0 || usePlaceholderData) {
        return;
      }

      const prefetchRequest = buildPrefetchBatchRequest({
        articleFilter,
        buildRequestSignature,
        getKnownLastFetchedAtByUrl,
        normalizedSources,
        options,
      });

      await queryClient.prefetchQuery(
        buildFeedBatchQueryOptions(
          normalizedSources,
          prefetchRequest.queryKey,
          {
            ...options,
            articleFilter,
            articleLimit: options?.articleLimit,
            knownLastFetchedAtByUrl: prefetchRequest.knownLastFetchedAtByUrl,
          },
        ),
      );
    },
    [
      articleFilter,
      buildRequestSignature,
      buildFeedBatchQueryOptions,
      getKnownLastFetchedAtByUrl,
      queryClient,
      usePlaceholderData,
    ],
  );
  return { loadBatchResults, prefetchFeedBatch };
}

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
  );

  return {
    knownLastFetchedAtByUrl,
    queryKey: getFeedBatchQueryKey(requestSignature, {
      articleFilter,
      articleLimit: options?.articleLimit,
      knownLastFetchedAtByUrl,
      skipRefresh: options?.skipRefresh,
    }),
  };
}

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
