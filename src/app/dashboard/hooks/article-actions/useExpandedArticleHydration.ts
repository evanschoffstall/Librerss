import { useCallback, useEffect, useRef } from "react";

import { type Article } from "@/lib";

import { getArticleKey } from "../../services/article-collection";
import { type FeedExtractionSettings } from "../useArticleHydration";

interface UseExpandedArticleHydrationOptions {
  distillStrategy?: string;
  expandedArticleKey: null | string;
  feed: Article[];
  getFeedSettings: (feedUrl: string) => FeedExtractionSettings | undefined;
  hydrateArticleContent: (
    article: Article,
    options?: { force?: boolean },
  ) => Promise<void>;
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
}

/**
 * Keeps expanded-article hydration state aligned with restored UI expansion.
 *
 * Expanded rows can outlive the in-memory hydration map across refreshes or hot
 * reloads. This hook restores rich-content hydration and retriggers it when the
 * distillation strategy changes.
 */
export function useExpandedArticleHydration({
  distillStrategy,
  expandedArticleKey,
  feed,
  getFeedSettings,
  hydrateArticleContent,
  hydratedArticleLinks,
  hydratingArticleLinks,
}: UseExpandedArticleHydrationOptions) {
  const autoHydratedExpandedKeyRef = useRef<null | string>(null);
  const awaitingExpandedSyncKeyRef = useRef<null | string>(null);
  const previousDistillStrategyRef = useRef(distillStrategy);

  useEffect(() => {
    if (!expandedArticleKey) {
      if (!awaitingExpandedSyncKeyRef.current) {
        autoHydratedExpandedKeyRef.current = null;
      }
      return;
    }

    if (awaitingExpandedSyncKeyRef.current === expandedArticleKey) {
      awaitingExpandedSyncKeyRef.current = null;
    }

    if (autoHydratedExpandedKeyRef.current === expandedArticleKey) {
      return;
    }

    if (feed.length === 0) {
      return;
    }

    const article = feed.find((candidate) => getArticleKey(candidate) === expandedArticleKey);
    const link = article?.link.trim() ?? "";

    if (
      article &&
      link &&
      !article.hasFullContent &&
      !hydratedArticleLinks[link] &&
      !hydratingArticleLinks[link]
    ) {
      autoHydratedExpandedKeyRef.current = expandedArticleKey;
      void hydrateArticleContent(article);
    }
  }, [
    expandedArticleKey,
    feed,
    hydratedArticleLinks,
    hydratingArticleLinks,
    hydrateArticleContent,
  ]);

  useEffect(() => {
    if (previousDistillStrategyRef.current === distillStrategy) {
      return;
    }

    previousDistillStrategyRef.current = distillStrategy;

    if (!expandedArticleKey || feed.length === 0) {
      return;
    }

    const article = feed.find((candidate) => getArticleKey(candidate) === expandedArticleKey);
    const link = article?.link.trim() ?? "";
    const feedUrl = article?.feedUrl?.trim() ?? "";

    if (feedUrl && getFeedSettings(feedUrl)?.extractionDisabled) {
      return;
    }

    if (!article || !link || hydratingArticleLinks[link]) {
      return;
    }

    autoHydratedExpandedKeyRef.current = expandedArticleKey;
    void hydrateArticleContent(article, { force: true });
  }, [
    distillStrategy,
    expandedArticleKey,
    feed,
    getFeedSettings,
    hydratingArticleLinks,
    hydrateArticleContent,
  ]);

  /** Marks an expansion as already handled so restore effects do not duplicate it. */
  const markExpandedArticleHydrationHandled = useCallback((articleKey: string) => {
    awaitingExpandedSyncKeyRef.current = articleKey;
    autoHydratedExpandedKeyRef.current = articleKey;
  }, []);

  /** Clears the transient expansion-tracking state after a collapse or reset. */
  const clearExpandedArticleHydrationTracking = useCallback(() => {
    awaitingExpandedSyncKeyRef.current = null;
    autoHydratedExpandedKeyRef.current = null;
  }, []);

  return {
    clearExpandedArticleHydrationTracking,
    markExpandedArticleHydrationHandled,
  };
}