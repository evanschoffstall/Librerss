"use client";

import type { Article, CategoryTreeNode } from "@/lib";
import { FeedService } from "@/lib";
import { CONFIG } from "@/lib/config";
import { getPlaceholderArticlesForSource } from "@/lib/core/placeholder";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { dedupeAndSortArticles } from "../helpers/article-helpers";
import {
  type FeedBatchSource,
  mapBatchResultsToArticles,
} from "../helpers/batch-helpers";
import {
  buildCategoriesFromSources,
  buildDefaultCategories,
  flattenCategoryFeeds,
} from "../helpers/category-helpers";

const FEED_LOADING_FAILSAFE_MS = 20_000;

const normalizeFeedBatchSources = (
  sources: FeedBatchSource[],
): FeedBatchSource[] => {
  const seen = new Set<string>();

  return sources.filter((source) => {
    if (!source.url || seen.has(source.url)) {
      return false;
    }

    seen.add(source.url);
    return true;
  });
};

const buildBatchRequestSignature = (sources: FeedBatchSource[]): string =>
  sources
    .map((source) => source.url)
    .sort()
    .join("|");

const mapFeedNodesToBatchSources = (
  nodes: CategoryTreeNode[],
): FeedBatchSource[] =>
  nodes
    .filter((node): node is CategoryTreeNode & { data: { url: string } } =>
      Boolean(node.data?.url),
    )
    .map((node) => ({
      url: node.data.url,
      name: node.label,
    }));

interface UseFeedLoaderOptions {
  usePlaceholderData: boolean;
  categoriesRef: React.MutableRefObject<CategoryTreeNode[]>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<string | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

type FeedFetchOptions = {
  forceRefresh?: boolean;
  requestSource?: string;
};

export function useFeedLoader({
  usePlaceholderData,
  categoriesRef,
  setFeed,
  setCategories,
  setExpandedArticleKey,
  setLoading,
}: UseFeedLoaderOptions) {
  const currentRequestIdRef = useRef(0);
  const activeRequestSignatureRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [loading, setLocalLoading] = useState(false);

  const logRefreshDiagnostics = useCallback(
    (event: string, details: Record<string, unknown>) => {
      if (!CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
        return;
      }

      console.info(`[dashboard] ${event}`, details);
    },
    [],
  );

  const syncLoading = useCallback(
    (value: boolean) => {
      setLocalLoading(value);
      setLoading(value);
    },
    [setLoading],
  );

  const loadFeedSources = useCallback(async (): Promise<CategoryTreeNode[]> => {
    try {
      const sources = await FeedService.getFeedSources();

      if (sources.length === 0) {
        const defaults = buildDefaultCategories(usePlaceholderData);
        setCategories(defaults);
        return defaults;
      }

      const nextCategories = buildCategoriesFromSources(sources);
      setCategories(nextCategories);
      return nextCategories;
    } catch (err) {
      console.error("Feed source fetch error:", err);
      const defaults = buildDefaultCategories(usePlaceholderData);
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
    ): Promise<Array<{
      url: string;
      articles: Article[];
      ok: boolean;
    }> | null> => {
      const urls = normalizedSources.map((s) => s.url);
      try {
        // Single fetch: returns cached articles and refreshes stale feeds in one pass
        return await FeedService.getFeedsBatch(urls, {
          skipRefresh: usePlaceholderData,
          forceRefresh: options?.forceRefresh === true,
          requestSource: options?.requestSource,
          signal,
        });
      } catch (error) {
        // Don't show errors for aborted requests
        if (error instanceof Error && error.name === "AbortError") {
          return null;
        }
        if (error instanceof Error && error.name === "CanceledError") {
          return null;
        }

        if (usePlaceholderData) {
          const fallbackArticles = dedupeAndSortArticles(
            normalizedSources.flatMap((source) =>
              getPlaceholderArticlesForSource(source.url).map((article) => ({
                ...article,
                feedName: source.name,
                feedUrl: source.url,
              })),
            ),
          );
          setFeed(fallbackArticles);
          setExpandedArticleKey(null);
        } else {
          console.error("Batch feed fetch error:", error);
          toast.error("Unable to load this feed right now.", {
            description: "Please try refreshing the selected source again.",
          });
        }
        return null;
      }
    },
    [usePlaceholderData, setFeed, setExpandedArticleKey],
  );

  const handleEmptyBatchResult = useCallback(() => {
    const hasConfiguredFeeds =
      flattenCategoryFeeds(categoriesRef.current).length > 0;
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
        skipRefresh: usePlaceholderData,
      });

      // Cancel any previous request
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const normalizedSources = normalizeFeedBatchSources(sources);
      const requestSignature = buildBatchRequestSignature(normalizedSources);

      if (
        loading &&
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
      setFeed([]);

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
          resultCount: batchResults.length,
          okCount: batchResults.filter((item) => item.ok).length,
          missingCount: batchResults.filter((item) => !item.ok).length,
          articlesByUrl: batchResults.map((item) => ({
            url: item.url,
            ok: item.ok,
            articleCount: item.articles.length,
          })),
        });

        const sourceNamesByUrl = new Map(
          normalizedSources.map((source) => [source.url, source.name] as const),
        );

        const articles = mapBatchResultsToArticles(
          batchResults,
          sourceNamesByUrl,
          usePlaceholderData,
          getPlaceholderArticlesForSource,
        );

        if (articles.length > 0) {
          setFeed(articles);
          setExpandedArticleKey(null);
          logRefreshDiagnostics("refresh:applied", {
            requestId,
            articleCount: articles.length,
          });
        } else {
          logRefreshDiagnostics("refresh:empty-after-map", {
            requestId,
          });
          handleEmptyBatchResult();
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
      loading,
      usePlaceholderData,
      setFeed,
      setExpandedArticleKey,
      syncLoading,
      logRefreshDiagnostics,
      fetchBatchOrPlaceholder,
      handleEmptyBatchResult,
    ],
  );

  const fetchFeed = useCallback(
    async (url: string, options?: FeedFetchOptions) => {
      const sourceName = flattenCategoryFeeds(categoriesRef.current).find(
        (node) => node.data?.url === url,
      )?.label;
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
        flattenCategoryFeeds(resolvedCategories),
      );
      await fetchFeedBatch(sources, options);
    },
    [fetchFeedBatch, categoriesRef],
  );

  return {
    loading,
    loadFeedSources,
    fetchFeed,
    fetchCategoryFeeds,
    fetchAllFeeds,
    FEED_LOADING_FAILSAFE_MS,
  };
}
