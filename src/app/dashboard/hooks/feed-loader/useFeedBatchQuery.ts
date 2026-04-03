"use client";

import { type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import {
  type FeedBatchSource,
  normalizeFeedBatchSources,
} from "../../services/feed-batch";
import {
  resolveFeedBatchResults,
} from "../../services/feed-batch-resolver";
import {
  classifyFeedBatchError,
  type FeedBatchResult,
  isCanceledBatchRequest,
} from "../../services/feed-loader-helpers";
import {
  resolveFeedBatchStaleTime,
} from "../../services/feed-loader-state";
import {
  getFeedBatchQueryKey,
} from "../../services/query-keys";
import {
  type FeedFetchOptions,
} from "../../services/selection";

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
  /** Builds the shared query options used by fetch and prefetch paths. */
  const buildFeedBatchQueryOptions = useCallback(
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

  /** Silently warms a feed-batch query so feed switches can reuse fresh cache. */
  const prefetchFeedBatch = useCallback(
    async (sources: FeedBatchSource[], options?: FeedFetchOptions) => {
      const normalizedSources = normalizeFeedBatchSources(sources);
      if (normalizedSources.length === 0 || usePlaceholderData) {
        return;
      }

      const knownLastFetchedAtByUrl = getKnownLastFetchedAtByUrl(
        normalizedSources,
        options?.keepExistingFeed === true,
      );
      const requestSignature = buildRequestSignature(
        normalizedSources,
        options?.articleLimit,
      );
      const queryKey = getFeedBatchQueryKey(requestSignature, {
        articleFilter,
        articleLimit: options?.articleLimit,
        knownLastFetchedAtByUrl,
        skipRefresh: options?.skipRefresh,
      });

      await queryClient.prefetchQuery(
        buildFeedBatchQueryOptions(normalizedSources, queryKey, {
          ...options,
          articleFilter,
          articleLimit: options?.articleLimit,
          knownLastFetchedAtByUrl,
        }),
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

  return {
    loadBatchResults,
    prefetchFeedBatch,
  };
}