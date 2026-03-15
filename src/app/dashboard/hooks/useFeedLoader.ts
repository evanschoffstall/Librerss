"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { findFeedNodeByUrl, getAllFeedNodes } from "../services/category-tree";
import {
  buildBatchRequestSignature,
  FEED_LOADING_FAILSAFE_MS,
  type FeedBatchSource,
  mapFeedNodesToBatchSources,
  normalizeFeedBatchSources,
} from "../services/feed-batch";
import {
  buildFeedBatchOutcome,
  formatFeedFailureLabel,
} from "../services/feed-batch-outcome";
import { resolveFeedBatchResults } from "../services/feed-batch-resolver";
import {
  type FeedBatchResult,
  isCanceledBatchRequest,
  mergeHydratedContent,
  resolveExpandedArticleKey,
  summarizeBatchResults,
} from "../services/feed-loader-helpers";
import { loadFeedSourceTree } from "../services/feed-source-tree";
import {
  getFeedBatchQueryKey,
  getFeedSourceTreeQueryKey,
} from "../services/query-keys";
import type { FeedFetchOptions } from "../services/selection";

import type { Article, CategoryTreeNode } from "@/lib";
import { clientFeedRefreshDiagnosticsEnabled } from "@/lib/config";
import { getPlaceholderArticlesForSource } from "@/lib/core/placeholder";

interface BeginFeedRequestOptions {
  forceRefresh: boolean;
  isBackground: boolean;
  queryKey: ReturnType<typeof getFeedBatchQueryKey>;
  requestSignature: string;
}

type BeginFeedRequestResult =
  | {
      requestId: number;
      skippedDuplicate: false;
    }
  | {
      requestId: number;
      skippedDuplicate: true;
    };

type FeedBatchQueryKey = ReturnType<typeof getFeedBatchQueryKey>;

interface UseFeedLoaderOptions {
  categoriesRef: RefObject<CategoryTreeNode[]>;
  feedRef: RefObject<Article[]>;
  onFeedBatchLoaded?: (timestamp: Date) => void;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<null | string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  usePlaceholderData: boolean;
}

/** Short-lived freshness window that lets recent selections reuse the last batch result. */
const DASHBOARD_FEED_BATCH_SELECTION_STALE_TIME_MS = 45_000;

/** Returns whether the real empty-feed-source onboarding toast should be shown. */
export function shouldShowNoFeedSourcesToast(
  hasConfiguredFeeds: boolean,
  usePlaceholderData: boolean,
): boolean {
  return !hasConfiguredFeeds && !usePlaceholderData;
}

export function useFeedLoader({
  categoriesRef,
  feedRef,
  onFeedBatchLoaded,
  setCategories,
  setExpandedArticleKey,
  setFeed,
  setLoading,
  usePlaceholderData,
}: UseFeedLoaderOptions) {
  const queryClient = useQueryClient();
  const lastFetchedAtByUrlRef = useRef(new Map<string, Date>());
  const currentRequestIdRef = useRef(0);
  const activeRequestSignatureRef = useRef<null | string>(null);
  const activeRequestQueryKeyRef = useRef<FeedBatchQueryKey | null>(null);
  const loadingRef = useRef(false);
  const [loading, setLocalLoading] = useState(false);
  const [loadingEpoch, setLoadingEpoch] = useState(0);

  /** Mirrors loader activity into both local hook state and the shared controller state. */
  const syncLoading = useCallback(
    (value: boolean) => {
      loadingRef.current = value;
      setLocalLoading(value);
      setLoading(value);
    },
    [setLoading],
  );

  /** Starts a new loader session while delegating actual cancellation to TanStack Query. */
  const beginFeedRequest = useCallback(
    ({
      forceRefresh,
      isBackground,
      queryKey,
      requestSignature,
    }: BeginFeedRequestOptions): BeginFeedRequestResult => {
      if (
        loadingRef.current &&
        activeRequestSignatureRef.current === requestSignature &&
        !forceRefresh
      ) {
        return {
          requestId: currentRequestIdRef.current,
          skippedDuplicate: true,
        };
      }

      currentRequestIdRef.current += 1;
      const requestId = currentRequestIdRef.current;

      if (activeRequestQueryKeyRef.current) {
        void queryClient.cancelQueries({
          exact: true,
          queryKey: activeRequestQueryKeyRef.current,
        });
      }

      activeRequestSignatureRef.current = requestSignature;
      activeRequestQueryKeyRef.current = queryKey;

      if (!isBackground) {
        syncLoading(true);
        setLoadingEpoch((epoch) => epoch + 1);
      }

      return {
        requestId,
        skippedDuplicate: false,
      };
    },
    [queryClient, syncLoading],
  );

  /** Completes the active loader session if it still matches the latest request. */
  const finishFeedRequest = useCallback(
    (requestId: number) => {
      if (currentRequestIdRef.current !== requestId) {
        return;
      }

      activeRequestQueryKeyRef.current = null;
      activeRequestSignatureRef.current = null;
      syncLoading(false);
    },
    [syncLoading],
  );

  /** Returns whether a request id still refers to the most recent loader session. */
  const isCurrentFeedRequest = useCallback(
    (requestId: number) => currentRequestIdRef.current === requestId,
    [],
  );

  /** Cancels the active Query-backed request and clears the visible loading state. */
  const cancelPendingRequest = useCallback(() => {
    if (activeRequestQueryKeyRef.current) {
      void queryClient.cancelQueries({
        exact: true,
        queryKey: activeRequestQueryKeyRef.current,
      });
    }

    activeRequestQueryKeyRef.current = null;
    activeRequestSignatureRef.current = null;
    currentRequestIdRef.current += 1;
    syncLoading(false);
    return currentRequestIdRef.current;
  }, [queryClient, syncLoading]);

  /** Exposes whether a foreground feed request is currently active. */
  const isLoadingRequest = useCallback(() => loadingRef.current, []);

  const logRefreshDiagnostics = useCallback(
    (event: string, details: Record<string, unknown>) => {
      if (!clientFeedRefreshDiagnosticsEnabled()) {
        return;
      }

      console.info("[dashboard]", event, details);
    },
    [],
  );

  /** Reads the most recent per-source fetch timestamps for a batch request. */
  const getKnownLastFetchedAtByUrl = useCallback(
    (normalizedSources: FeedBatchSource[], keepExistingFeed: boolean) => {
      if (!keepExistingFeed) {
        return undefined;
      }

      return new Map(
        normalizedSources
          .map((source) => {
            const lastFetchedAt = lastFetchedAtByUrlRef.current.get(source.url);
            return lastFetchedAt
              ? ([source.url, lastFetchedAt] as const)
              : null;
          })
          .filter((entry): entry is readonly [string, Date] => entry !== null),
      );
    },
    [],
  );

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
          options,
          signal,
        ),
      queryKey,
      staleTime: resolveFeedBatchStaleTime(options),
    }),
    [usePlaceholderData],
  );

  const loadFeedSources = useCallback(async (): Promise<CategoryTreeNode[]> => {
    const nextCategories = await queryClient.fetchQuery({
      queryFn: () => loadFeedSourceTree(usePlaceholderData),
      queryKey: getFeedSourceTreeQueryKey(usePlaceholderData),
      staleTime: 0,
    });
    setCategories(nextCategories);
    return nextCategories;
  }, [queryClient, setCategories, usePlaceholderData]);

  const loadBatchResults = useCallback(
    async (
      normalizedSources: FeedBatchSource[],
      queryKey: FeedBatchQueryKey,
      options?: FeedFetchOptions,
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
        toast.error("Unable to load this feed right now.", {
          description: "Please try refreshing the selected source again.",
        });
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
      const queryKey = getFeedBatchQueryKey(
        buildBatchRequestSignature(normalizedSources),
        {
          knownLastFetchedAtByUrl,
          skipRefresh: options?.skipRefresh,
        },
      );

      await queryClient.prefetchQuery(
        buildFeedBatchQueryOptions(normalizedSources, queryKey, {
          ...options,
          knownLastFetchedAtByUrl,
        }),
      );
    },
    [
      buildFeedBatchQueryOptions,
      getKnownLastFetchedAtByUrl,
      queryClient,
      usePlaceholderData,
    ],
  );

  const handleEmptyBatchResult = useCallback(() => {
    const hasConfiguredFeeds =
      getAllFeedNodes(categoriesRef.current).length > 0;
    if (shouldShowNoFeedSourcesToast(hasConfiguredFeeds, usePlaceholderData)) {
      toast.info("No feed sources yet.", {
        description: "Add your feeds in Settings to start reading.",
      });
    } else if (!usePlaceholderData) {
      toast.info("No items available for this selection right now.", {
        description: "Try another feed or check back after the next refresh.",
      });
    }
  }, [usePlaceholderData, categoriesRef]);

  const fetchFeedBatch = useCallback(
    async (sources: FeedBatchSource[], options?: FeedFetchOptions) => {
      // Background refreshes (auto-refresh without force) must not replace
      // visible articles with skeleton loaders or race the failsafe timer.
      // Yield to any in-flight loading request rather than aborting it.
      const keepExistingFeed = options?.keepExistingFeed === true;
      const forceRefresh = options?.forceRefresh === true;
      const isBackground = keepExistingFeed && !forceRefresh;
      if (isBackground && isLoadingRequest()) {
        return;
      }

      const normalizedSources = normalizeFeedBatchSources(sources);
      const requestSignature = buildBatchRequestSignature(normalizedSources);
      const knownLastFetchedAtByUrl = getKnownLastFetchedAtByUrl(
        normalizedSources,
        options?.keepExistingFeed === true,
      );
      const queryKey = getFeedBatchQueryKey(requestSignature, {
        knownLastFetchedAtByUrl,
        skipRefresh: options?.skipRefresh,
      });
      const batchQueryStaleTime = resolveFeedBatchStaleTime(options);

      const requestState = beginFeedRequest({
        forceRefresh,
        isBackground,
        queryKey,
        requestSignature,
      });

      if (requestState.skippedDuplicate) {
        logRefreshDiagnostics("refresh:skipped-duplicate", {
          requestId: requestState.requestId,
          requestSignature,
        });
        return;
      }

      const { requestId } = requestState;

      logRefreshDiagnostics("refresh:start", {
        forceRefresh: options?.forceRefresh === true,
        requestId,
        requestSource: options?.requestSource ?? "unspecified",
        skipRefresh: options?.skipRefresh ?? usePlaceholderData,
        sourceCount: sources.length,
      });

      if (
        !options?.keepExistingFeed &&
        !isFreshFeedBatchQuery(queryClient, queryKey, batchQueryStaleTime)
      ) {
        setFeed([]);
      }

      try {
        if (normalizedSources.length === 0) {
          logRefreshDiagnostics("refresh:empty-source-list", {
            requestId,
          });
          setExpandedArticleKey(null);
          return;
        }

        const batchResults = await loadBatchResults(
          normalizedSources,
          queryKey,
          {
            ...options,
            knownLastFetchedAtByUrl,
          },
        );
        if (batchResults === null) {
          logRefreshDiagnostics("refresh:no-results", {
            requestId,
          });
          return;
        }
        if (!isCurrentFeedRequest(requestId)) {
          logRefreshDiagnostics("refresh:stale-request", {
            requestId,
          });
          return;
        }

        logRefreshDiagnostics("refresh:batch-response", {
          requestId,
          ...summarizeBatchResults(batchResults),
        });

        const capturedOutcome = buildFeedBatchOutcome(
          normalizedSources,
          batchResults,
          usePlaceholderData,
          getPlaceholderArticlesForSource,
          keepExistingFeed ? feedRef.current : [],
        );

        setFeed((currentFeed) =>
          mergeHydratedContent(currentFeed, capturedOutcome.articles),
        );

        const {
          articles: resolvedArticles,
          failedFeeds,
          newestLastFetchedAt,
          sourceNamesByUrl,
        } = capturedOutcome;

        if (newestLastFetchedAt) {
          onFeedBatchLoaded?.(newestLastFetchedAt);
        }

        for (const result of batchResults) {
          if (result.lastFetchedAt) {
            lastFetchedAtByUrlRef.current.set(result.url, result.lastFetchedAt);
          }
        }

        notifyFeedFailures(failedFeeds, batchResults.length, sourceNamesByUrl);

        if (resolvedArticles.length > 0) {
          setExpandedArticleKey((currentKey) =>
            resolveExpandedArticleKey(currentKey, resolvedArticles),
          );
          logRefreshDiagnostics("refresh:applied", {
            articleCount: resolvedArticles.length,
            requestId,
          });
        } else {
          logRefreshDiagnostics("refresh:empty-after-map", {
            requestId,
          });
          // Only show the generic "no items" toast when we haven't already
          // surfaced a more specific upstream error toast above.
          if (failedFeeds.length === 0) {
            handleEmptyBatchResult();
          }
        }
      } finally {
        if (isCurrentFeedRequest(requestId)) {
          finishFeedRequest(requestId);
          logRefreshDiagnostics("refresh:finished", {
            requestId,
          });
        }
      }
    },
    [
      usePlaceholderData,
      setFeed,
      feedRef,
      setExpandedArticleKey,
      beginFeedRequest,
      finishFeedRequest,
      getKnownLastFetchedAtByUrl,
      logRefreshDiagnostics,
      loadBatchResults,
      handleEmptyBatchResult,
      isCurrentFeedRequest,
      isLoadingRequest,
      onFeedBatchLoaded,
      queryClient,
    ],
  );

  const fetchFeed = useCallback(
    async (url: string, options?: FeedFetchOptions) => {
      const sourceName = findFeedNodeByUrl(categoriesRef.current, url)?.label;
      await fetchFeedBatch([{ name: sourceName, url }], options);
    },
    [fetchFeedBatch, categoriesRef],
  );

  const fetchCategoryFeeds = useCallback(
    async (categoryNode: CategoryTreeNode, options?: FeedFetchOptions) => {
      const sources = mapFeedNodesToBatchSources(categoryNode.children ?? []);
      await fetchFeedBatch(sources, options);
    },
    [fetchFeedBatch],
  );

  const fetchAllFeeds = useCallback(
    async (
      sourceCategories?: CategoryTreeNode[],
      options?: FeedFetchOptions,
    ) => {
      const resolvedCategories = sourceCategories ?? categoriesRef.current;
      const sources = mapFeedNodesToBatchSources(
        getAllFeedNodes(resolvedCategories),
      );
      await fetchFeedBatch(sources, options);
    },
    [fetchFeedBatch, categoriesRef],
  );

  /** Prefetches a single feed from sidebar hover or focus intent. */
  const prefetchFeed = useCallback(
    async (url: string, options?: FeedFetchOptions) => {
      const sourceName = findFeedNodeByUrl(categoriesRef.current, url)?.label;
      await prefetchFeedBatch([{ name: sourceName, url }], options);
    },
    [categoriesRef, prefetchFeedBatch],
  );

  /** Prefetches the full contents of a category-level selection. */
  const prefetchCategoryFeeds = useCallback(
    async (categoryNode: CategoryTreeNode, options?: FeedFetchOptions) => {
      await prefetchFeedBatch(
        mapFeedNodesToBatchSources(categoryNode.children ?? []),
        options,
      );
    },
    [prefetchFeedBatch],
  );

  /** Prefetches the synthetic all-feeds surface from the current category tree. */
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

  const handleCancelPendingRequest = useCallback(() => {
    const requestId = cancelPendingRequest();
    logRefreshDiagnostics("refresh:forced-reset", {
      requestId,
    });
  }, [cancelPendingRequest, logRefreshDiagnostics]);

  return {
    cancelPendingRequest: handleCancelPendingRequest,
    FEED_LOADING_FAILSAFE_MS,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    loadFeedSources,
    loading,
    loadingEpoch,
    prefetchAllFeeds,
    prefetchCategoryFeeds,
    prefetchFeed,
  };
}

/** Returns whether a feed batch query is currently fresh enough to reuse inline. */
function isFreshFeedBatchQuery(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: FeedBatchQueryKey,
  staleTime: number,
) {
  if (staleTime <= 0) {
    return false;
  }

  const queryState = queryClient.getQueryState<FeedBatchResult[]>(queryKey);
  if (queryState?.status !== "success") {
    return false;
  }

  return Date.now() - queryState.dataUpdatedAt < staleTime;
}

function notifyFeedFailures(
  failedFeeds: FeedBatchResult[],
  totalFeedCount: number,
  sourceNamesByUrl: Map<string, string | undefined>,
) {
  if (failedFeeds.length === 0) {
    return;
  }

  if (failedFeeds.length === totalFeedCount) {
    toast.error("Unable to fetch feeds from upstream.", {
      description: "Try another feed or check back after the next refresh.",
    });
    return;
  }

  const failureLabel = formatFeedFailureLabel(failedFeeds, sourceNamesByUrl);

  toast.warning(`Some feeds failed to update: ${failureLabel}`, {
    description: "Showing cached articles. Check back after the next refresh.",
  });
}

/** Resolves how long a dashboard feed batch should remain selection-fresh. */
function resolveFeedBatchStaleTime(options?: FeedFetchOptions) {
  if (options?.forceRefresh === true) {
    return 0;
  }

  if (options?.skipRefresh === true) {
    return 60_000;
  }

  if (
    options?.requestSource === "auto-refresh" ||
    options?.requestSource === "manual-refresh"
  ) {
    return 0;
  }

  return DASHBOARD_FEED_BATCH_SELECTION_STALE_TIME_MS;
}
