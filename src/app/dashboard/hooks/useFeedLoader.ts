"use client";

import { type RefObject, useCallback, useRef } from "react";
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
import type { FeedFetchOptions } from "../services/selection";

import { useFeedRequestState } from "./useFeedRequestState";

import type { Article, CategoryTreeNode } from "@/lib";
import { clientFeedRefreshDiagnosticsEnabled } from "@/lib/config";
import { getPlaceholderArticlesForSource } from "@/lib/core/placeholder";

interface UseFeedLoaderOptions {
  categoriesRef: RefObject<CategoryTreeNode[]>;
  onFeedBatchLoaded?: (timestamp: Date) => void;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<null | string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  usePlaceholderData: boolean;
}

/** Returns whether the real empty-feed-source onboarding toast should be shown. */
export function shouldShowNoFeedSourcesToast(
  hasConfiguredFeeds: boolean,
  usePlaceholderData: boolean,
): boolean {
  return !hasConfiguredFeeds && !usePlaceholderData;
}

export function useFeedLoader({
  categoriesRef,
  onFeedBatchLoaded,
  setCategories,
  setExpandedArticleKey,
  setFeed,
  setLoading,
  usePlaceholderData,
}: UseFeedLoaderOptions) {
  const feedRequestState = useFeedRequestState({ setLoading });
  const { loading, loadingEpoch } = feedRequestState;
  const lastFetchedAtByUrlRef = useRef(new Map<string, Date>());

  const logRefreshDiagnostics = useCallback(
    (event: string, details: Record<string, unknown>) => {
      if (!clientFeedRefreshDiagnosticsEnabled()) {
        return;
      }

      console.info("[dashboard]", event, details);
    },
    [],
  );

  const loadFeedSources = useCallback(async (): Promise<CategoryTreeNode[]> => {
    const nextCategories = await loadFeedSourceTree(usePlaceholderData);
    setCategories(nextCategories);
    return nextCategories;
  }, [usePlaceholderData, setCategories]);

  const loadBatchResults = useCallback(
    async (
      normalizedSources: FeedBatchSource[],
      options?: FeedFetchOptions,
      signal?: AbortSignal,
    ): Promise<FeedBatchResult[] | null> => {
      try {
        return await resolveFeedBatchResults(
          normalizedSources,
          usePlaceholderData,
          options,
          signal,
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
    [usePlaceholderData],
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
      if (isBackground && feedRequestState.isLoading()) {
        return;
      }

      const normalizedSources = normalizeFeedBatchSources(sources);
      const requestSignature = buildBatchRequestSignature(normalizedSources);
      const knownLastFetchedAtByUrl =
        options?.keepExistingFeed === true
          ? new Map(
              normalizedSources
                .map((source) => {
                  const lastFetchedAt = lastFetchedAtByUrlRef.current.get(
                    source.url,
                  );
                  return lastFetchedAt
                    ? ([source.url, lastFetchedAt] as const)
                    : null;
                })
                .filter(
                  (entry): entry is readonly [string, Date] => entry !== null,
                ),
            )
          : undefined;

      const requestState = feedRequestState.beginRequest({
        forceRefresh,
        isBackground,
        requestSignature,
      });

      if (requestState.skippedDuplicate) {
        logRefreshDiagnostics("refresh:skipped-duplicate", {
          requestId: requestState.requestId,
          requestSignature,
        });
        return;
      }

      const { abortController, requestId } = requestState;

      logRefreshDiagnostics("refresh:start", {
        forceRefresh: options?.forceRefresh === true,
        requestId,
        requestSource: options?.requestSource ?? "unspecified",
        skipRefresh: options?.skipRefresh ?? usePlaceholderData,
        sourceCount: sources.length,
      });

      if (!options?.keepExistingFeed) {
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
          {
            ...options,
            knownLastFetchedAtByUrl,
          },
          abortController.signal,
        );
        if (batchResults === null) {
          logRefreshDiagnostics("refresh:no-results", {
            requestId,
          });
          return;
        }
        if (abortController.signal.aborted) {
          logRefreshDiagnostics("refresh:aborted", {
            requestId,
          });
          return;
        }
        if (!feedRequestState.isCurrentRequest(requestId)) {
          logRefreshDiagnostics("refresh:stale-request", {
            requestId,
          });
          return;
        }

        logRefreshDiagnostics("refresh:batch-response", {
          requestId,
          ...summarizeBatchResults(batchResults),
        });

        // Capture outcome synchronously from the setFeed callback; the outer
        // variables would otherwise be narrowed to their null initializer type
        // because TypeScript cannot track assignments through setState closures.
        let capturedOutcome!: ReturnType<typeof buildFeedBatchOutcome>;

        setFeed((currentFeed) => {
          capturedOutcome = buildFeedBatchOutcome(
            normalizedSources,
            batchResults,
            usePlaceholderData,
            getPlaceholderArticlesForSource,
            keepExistingFeed ? currentFeed : [],
          );
          return mergeHydratedContent(currentFeed, capturedOutcome.articles);
        });

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
        if (feedRequestState.isCurrentRequest(requestId)) {
          feedRequestState.finishRequest(requestId);
          logRefreshDiagnostics("refresh:finished", {
            requestId,
          });
        }
      }
    },
    [
      usePlaceholderData,
      setFeed,
      setExpandedArticleKey,
      feedRequestState,
      logRefreshDiagnostics,
      loadBatchResults,
      handleEmptyBatchResult,
      onFeedBatchLoaded,
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

  const cancelPendingRequest = useCallback(() => {
    const requestId = feedRequestState.cancelPendingRequest();
    logRefreshDiagnostics("refresh:forced-reset", {
      requestId,
    });
  }, [feedRequestState, logRefreshDiagnostics]);

  return {
    cancelPendingRequest,
    FEED_LOADING_FAILSAFE_MS,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    loadFeedSources,
    loading,
    loadingEpoch,
  };
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
