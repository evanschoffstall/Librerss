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
  const latestFeedRequestIdRef = useRef(0);
  const activeFeedRequestSignatureRef = useRef<string | null>(null);
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

  const fetchFeedBatch = useCallback(
    async (sources: FeedBatchSource[]) => {
      const requestId = latestFeedRequestIdRef.current + 1;
      latestFeedRequestIdRef.current = requestId;

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

      if (
        loading &&
        activeFeedRequestSignatureRef.current === requestSignature
      ) {
        return;
      }

      activeFeedRequestSignatureRef.current = requestSignature;
      syncLoading(true);
      setFeed([]);

      const toBatchArticles = (
        batchResults: Array<{ url: string; articles: Article[]; ok: boolean }>,
      ) =>
        mapBatchResultsToArticles(
          batchResults,
          new Map(normalizedSources.map((s) => [s.url, s.name] as const)),
          usePlaceholderData,
          getPlaceholderArticlesForSource,
        );

      try {
        if (normalizedSources.length === 0) {
          setExpandedArticleKey(null);
          return;
        }

        const urls = normalizedSources.map((s) => s.url);

        // Phase 1: cached DB articles
        let cachedBatchResults: Array<{
          url: string;
          articles: Article[];
          ok: boolean;
        }>;
        try {
          cachedBatchResults = await FeedService.getFeedsBatch(urls, {
            skipRefresh: true,
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
            return;
          }
          console.error("Batch feed fetch error:", error);
          toast.error("Unable to load this feed right now.", {
            description: "Please try refreshing the selected source again.",
          });
          return;
        }

        if (latestFeedRequestIdRef.current !== requestId) return;

        const cachedArticles = toBatchArticles(cachedBatchResults);
        if (cachedArticles.length > 0) {
          setFeed(cachedArticles);
          setExpandedArticleKey(null);
        }

        if (latestFeedRequestIdRef.current === requestId) {
          syncLoading(false);
        }

        // Phase 2: upstream refresh
        if (!usePlaceholderData) {
          try {
            const freshBatchResults = await FeedService.getFeedsBatch(urls, {
              skipRefresh: false,
            });
            if (latestFeedRequestIdRef.current !== requestId) return;
            const freshArticles = toBatchArticles(freshBatchResults);
            if (freshArticles.length > 0) {
              setFeed(freshArticles);
              setExpandedArticleKey(null);
              return;
            }
          } catch {
            // Background refresh failed — cached articles remain.
          }

          if (
            cachedArticles.length === 0 &&
            latestFeedRequestIdRef.current === requestId
          ) {
            const hasConfiguredFeeds =
              flattenCategoryFeeds(categoriesRef.current).length > 0;
            if (!hasConfiguredFeeds) {
              toast.info("No feed sources yet.", {
                description: "Add your feeds in Settings to start reading.",
              });
              return;
            }
            toast.error("Unable to load this feed right now.", {
              description: "Please try refreshing the selected source again.",
            });
          }
        }
      } finally {
        if (latestFeedRequestIdRef.current === requestId) {
          activeFeedRequestSignatureRef.current = null;
          syncLoading(false);
        }
      }
    },
    [
      loading,
      usePlaceholderData,
      categoriesRef,
      setFeed,
      setExpandedArticleKey,
      syncLoading,
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
