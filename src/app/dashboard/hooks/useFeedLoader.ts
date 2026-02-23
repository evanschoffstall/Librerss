"use client";

import type { Article, CategoryTreeNode } from "@/lib";
import { FeedService } from "@/lib";
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

interface UseFeedLoaderOptions {
  usePlaceholderData: boolean;
  categoriesRef: React.MutableRefObject<CategoryTreeNode[]>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<string | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

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
  const [loading, setLocalLoading] = useState(false);

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
    ): Promise<Array<{ url: string; articles: Article[]; ok: boolean }> | null> => {
      const urls = normalizedSources.map((s) => s.url);
      try {
        // Single fetch: returns cached articles and refreshes stale feeds in one pass
        return await FeedService.getFeedsBatch(urls, {
          skipRefresh: usePlaceholderData,
        });
      } catch (error) {
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
      toast.error("Unable to load this feed right now.", {
        description: "Please try refreshing the selected source again.",
      });
    }
  }, [usePlaceholderData, categoriesRef]);

  const fetchFeedBatch = useCallback(
    async (sources: FeedBatchSource[]) => {
      const requestId = currentRequestIdRef.current + 1;
      currentRequestIdRef.current = requestId;

      const seen = new Set<string>();
      const normalizedSources = sources.filter((s) => {
        if (!s.url || seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
      });

      const requestSignature = normalizedSources
        .map((source) => source.url)
        .sort()
        .join("|");

      if (loading && activeRequestSignatureRef.current === requestSignature) {
        return;
      }

      activeRequestSignatureRef.current = requestSignature;
      syncLoading(true);
      setFeed([]);

      try {
        if (normalizedSources.length === 0) {
          setExpandedArticleKey(null);
          return;
        }

        const batchResults = await fetchBatchOrPlaceholder(normalizedSources);
        if (batchResults === null) return;
        if (currentRequestIdRef.current !== requestId) return;

        const articles = mapBatchResultsToArticles(
          batchResults,
          new Map(normalizedSources.map((s) => [s.url, s.name] as const)),
          usePlaceholderData,
          getPlaceholderArticlesForSource,
        );

        if (articles.length > 0) {
          setFeed(articles);
          setExpandedArticleKey(null);
        } else {
          handleEmptyBatchResult();
        }
      } finally {
        if (currentRequestIdRef.current === requestId) {
          activeRequestSignatureRef.current = null;
          syncLoading(false);
        }
      }
    },
    [
      loading,
      usePlaceholderData,
      setFeed,
      setExpandedArticleKey,
      syncLoading,
      fetchBatchOrPlaceholder,
      handleEmptyBatchResult,
    ],
  );

  const fetchFeed = useCallback(
    async (url: string) => {
      const sourceName = flattenCategoryFeeds(categoriesRef.current).find(
        (node) => node.data?.url === url,
      )?.label;
      await fetchFeedBatch([{ url, name: sourceName }]);
    },
    [fetchFeedBatch, categoriesRef],
  );

  const fetchCategoryFeeds = useCallback(
    async (categoryNode: CategoryTreeNode) => {
      const sources = (categoryNode.children ?? [])
        .filter((node: CategoryTreeNode) => node.data?.url)
        .map(
          (node: CategoryTreeNode): FeedBatchSource => ({
            url: node.data!.url,
            name: node.label,
          }),
        );
      await fetchFeedBatch(sources);
    },
    [fetchFeedBatch],
  );

  const fetchAllFeeds = useCallback(
    async (sourceCategories?: CategoryTreeNode[]) => {
      const resolvedCategories = sourceCategories ?? categoriesRef.current;
      const sources = flattenCategoryFeeds(resolvedCategories)
        .filter((node: CategoryTreeNode) => node.data?.url)
        .map(
          (node: CategoryTreeNode): FeedBatchSource => ({
            url: node.data!.url,
            name: node.label,
          }),
        );
      await fetchFeedBatch(sources);
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
