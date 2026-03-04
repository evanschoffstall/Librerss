"use client";

import type { Article, CategoryTreeNode } from "@/lib";
import { FeedService } from "@/lib";
import { clientFeedRefreshDiagnosticsEnabled } from "@/lib/config";
import { getPlaceholderArticlesForSource } from "@/lib/core/placeholder";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildCategoriesFromSources,
  buildDefaultCategories,
  findFeedNodeByUrl,
  getAllFeedNodes,
} from "../services/category-tree";
import {
  buildBatchRequestSignature,
  FEED_LOADING_FAILSAFE_MS,
  mapBatchResultsToArticles,
  mapFeedNodesToBatchSources,
  normalizeFeedBatchSources,
  type FeedBatchSource,
} from "../services/feed-batch";
import {
  getNewestLastFetchedAt,
  getSourceNamesByUrl,
  isCanceledBatchRequest,
  resolveExpandedArticleKey,
  summarizeBatchResults,
  type FeedBatchResult,
} from "../services/feed-loader-helpers";
import type { FeedFetchOptions } from "../services/selection";

interface UseFeedLoaderOptions {
  usePlaceholderData: boolean;
  categoriesRef: React.MutableRefObject<CategoryTreeNode[]>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<string | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  onFeedBatchLoaded?: (timestamp: Date) => void;
}

function notifyFeedFailures(
  failedFeeds: FeedBatchResult[],
  totalFeedCount: number,
  sourceNamesByUrl: Map<string, string | undefined>,
) {
  if (failedFeeds.length === 0) {
    return;
  }

  const failedNames = failedFeeds.map((item) => {
    const sourceName = sourceNamesByUrl.get(item.url);
    return sourceName || item.url;
  });

  if (failedFeeds.length === totalFeedCount) {
    toast.error("Unable to fetch feeds from upstream.", {
      description: "Try another feed or check back after the next refresh.",
    });
    return;
  }

  const failureLabel =
    failedNames.length <= 3
      ? failedNames.join(", ")
      : `${failedNames.slice(0, 3).join(", ")} and ${failedNames.length - 3} more`;

  toast.warning(`Some feeds failed to update: ${failureLabel}`, {
    description: "Showing cached articles. Check back after the next refresh.",
  });
}

export function useFeedLoader({
  usePlaceholderData,
  categoriesRef,
  setFeed,
  setCategories,
  setExpandedArticleKey,
  setLoading,
  onFeedBatchLoaded,
}: UseFeedLoaderOptions) {
  const currentRequestIdRef = useRef(0);
  const activeRequestSignatureRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const [loading, setLocalLoading] = useState(false);
  const [loadingEpoch, setLoadingEpoch] = useState(0);

  const logRefreshDiagnostics = useCallback(
    (event: string, details: Record<string, unknown>) => {
      if (!clientFeedRefreshDiagnosticsEnabled()) {
        return;
      }

      console.info("[dashboard]", event, details);
    },
    [],
  );

  const syncLoading = useCallback(
    (value: boolean) => {
      loadingRef.current = value;
      setLocalLoading(value);
      setLoading(value);
    },
    [setLoading],
  );

  const loadFeedSources = useCallback(async (): Promise<CategoryTreeNode[]> => {
    // In placeholder/preview mode, skip the API call entirely
    if (usePlaceholderData) {
      const defaults = buildDefaultCategories(true);
      setCategories(defaults);
      return defaults;
    }

    try {
      const sources = await FeedService.getFeedSources();

      if (sources.length === 0) {
        const defaults = buildDefaultCategories(false);
        setCategories(defaults);
        return defaults;
      }

      const nextCategories = buildCategoriesFromSources(sources);
      setCategories(nextCategories);
      return nextCategories;
    } catch (err) {
      console.error("Feed source fetch error:", err);
      const defaults = buildDefaultCategories(false);
      setCategories(defaults);
      return defaults;
    }
  }, [usePlaceholderData, setCategories]);

  // Fetches the batch, falling back to placeholder data on error in dev mode.
  // Returns null when the caller should abort (error already handled).
  const fetchBatchOrPlaceholder = useCallback(
    async (
      normalizedSources: FeedBatchSource[],
      options?: FeedFetchOptions,
      signal?: AbortSignal,
    ): Promise<FeedBatchResult[] | null> => {
      const urls = normalizedSources.map((s) => s.url);
      // In placeholder/preview mode, skip the API call and use local data directly
      if (usePlaceholderData) {
        return normalizedSources.map((source) => ({
          url: source.url,
          articles: getPlaceholderArticlesForSource(source.url).map(
            (article) => ({
              ...article,
              feedName: source.name,
              feedUrl: source.url,
            }),
          ),
          ok: true,
        }));
      }

      try {
        // Single fetch: returns cached articles and refreshes stale feeds in one pass
        return await FeedService.getFeedsBatch(urls, {
          skipRefresh: options?.skipRefresh ?? false,
          forceRefresh: options?.forceRefresh === true,
          requestSource: options?.requestSource,
          signal,
        });
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
    if (!hasConfiguredFeeds) {
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
      const requestId = currentRequestIdRef.current + 1;
      currentRequestIdRef.current = requestId;

      logRefreshDiagnostics("refresh:start", {
        requestId,
        sourceCount: sources.length,
        forceRefresh: options?.forceRefresh === true,
        requestSource: options?.requestSource ?? "unspecified",
        skipRefresh: options?.skipRefresh ?? usePlaceholderData,
      });

      // Cancel any previous request
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const normalizedSources = normalizeFeedBatchSources(sources);
      const requestSignature = buildBatchRequestSignature(normalizedSources);

      if (
        loadingRef.current &&
        activeRequestSignatureRef.current === requestSignature &&
        options?.forceRefresh !== true
      ) {
        logRefreshDiagnostics("refresh:skipped-duplicate", {
          requestId,
          requestSignature,
        });
        return;
      }

      activeRequestSignatureRef.current = requestSignature;
      syncLoading(true);
      setLoadingEpoch((e) => e + 1);
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

        const batchResults = await fetchBatchOrPlaceholder(
          normalizedSources,
          options,
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
        if (currentRequestIdRef.current !== requestId) {
          logRefreshDiagnostics("refresh:stale-request", {
            requestId,
            currentRequestId: currentRequestIdRef.current,
          });
          return;
        }

        logRefreshDiagnostics("refresh:batch-response", {
          requestId,
          ...summarizeBatchResults(batchResults),
        });

        const newestLastFetchedAt = getNewestLastFetchedAt(batchResults);

        if (newestLastFetchedAt) {
          onFeedBatchLoaded?.(newestLastFetchedAt);
        }

        const failedFeeds = batchResults.filter((item) => item.error);
        const sourceNamesByUrl = getSourceNamesByUrl(normalizedSources);

        notifyFeedFailures(failedFeeds, batchResults.length, sourceNamesByUrl);

        const articles = mapBatchResultsToArticles(
          batchResults,
          sourceNamesByUrl,
          usePlaceholderData,
          getPlaceholderArticlesForSource,
        );

        if (articles.length > 0) {
          setFeed(articles);
          setExpandedArticleKey((currentKey) =>
            resolveExpandedArticleKey(currentKey, articles),
          );
          logRefreshDiagnostics("refresh:applied", {
            requestId,
            articleCount: articles.length,
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
        if (currentRequestIdRef.current === requestId) {
          activeRequestSignatureRef.current = null;
          syncLoading(false);
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
      syncLoading,
      logRefreshDiagnostics,
      fetchBatchOrPlaceholder,
      handleEmptyBatchResult,
      onFeedBatchLoaded,
    ],
  );

  const fetchFeed = useCallback(
    async (url: string, options?: FeedFetchOptions) => {
      const sourceName = findFeedNodeByUrl(categoriesRef.current, url)?.label;
      await fetchFeedBatch([{ url, name: sourceName }], options);
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
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRequestSignatureRef.current = null;
    currentRequestIdRef.current += 1;
    syncLoading(false);
    logRefreshDiagnostics("refresh:forced-reset", {
      requestId: currentRequestIdRef.current,
    });
  }, [logRefreshDiagnostics, syncLoading]);

  return {
    loading,
    loadingEpoch,
    loadFeedSources,
    fetchFeed,
    fetchCategoryFeeds,
    fetchAllFeeds,
    cancelPendingRequest,
    FEED_LOADING_FAILSAFE_MS,
  };
}
