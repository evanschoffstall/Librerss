import type React from "react";

import { useCallback, useEffect, useRef } from "react";

import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { type FeedExtractionSettings } from "@/app/dashboard/display-types";

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
  const expandedArticle = findExpandedArticle(feed, expandedArticleKey);

  useExpandedArticleHydrationRestoreEffect({
    autoHydratedExpandedKeyRef,
    awaitingExpandedSyncKeyRef,
    expandedArticle,
    expandedArticleKey,
    hydrateArticleContent,
    hydratedArticleLinks,
    hydratingArticleLinks,
  });
  useExpandedArticleDistillStrategyEffect({
    autoHydratedExpandedKeyRef,
    distillStrategy,
    expandedArticle,
    expandedArticleKey,
    getFeedSettings,
    hydrateArticleContent,
    hydratingArticleLinks,
    previousDistillStrategyRef,
  });

  /** Marks an expansion as already handled so restore effects do not duplicate it. */
  const markExpandedArticleHydrationHandled = useCallback(
    (articleKey: string) => {
      awaitingExpandedSyncKeyRef.current = articleKey;
      autoHydratedExpandedKeyRef.current = articleKey;
    },
    [],
  );

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

function findExpandedArticle(
  feed: Article[],
  expandedArticleKey: null | string,
) {
  if (!expandedArticleKey || feed.length === 0) {
    return undefined;
  }

  return feed.find(
    (candidate) => getArticleKey(candidate) === expandedArticleKey,
  );
}

function useExpandedArticleDistillStrategyEffect({
  autoHydratedExpandedKeyRef,
  distillStrategy,
  expandedArticle,
  expandedArticleKey,
  getFeedSettings,
  hydrateArticleContent,
  hydratingArticleLinks,
  previousDistillStrategyRef,
}: {
  autoHydratedExpandedKeyRef: React.RefObject<null | string>;
  distillStrategy: string | undefined;
  expandedArticle: Article | undefined;
  expandedArticleKey: null | string;
  getFeedSettings: UseExpandedArticleHydrationOptions["getFeedSettings"];
  hydrateArticleContent: UseExpandedArticleHydrationOptions["hydrateArticleContent"];
  hydratingArticleLinks: Record<string, boolean>;
  previousDistillStrategyRef: React.RefObject<string | undefined>;
}) {
  useEffect(() => {
    if (previousDistillStrategyRef.current === distillStrategy) {
      return;
    }

    previousDistillStrategyRef.current = distillStrategy;
    const link = expandedArticle?.link.trim() ?? "";
    const feedUrl = expandedArticle?.feedUrl?.trim() ?? "";

    if (feedUrl && getFeedSettings(feedUrl)?.extractionDisabled) {
      return;
    }

    if (
      !expandedArticleKey ||
      !expandedArticle ||
      !link ||
      hydratingArticleLinks[link]
    ) {
      return;
    }

    autoHydratedExpandedKeyRef.current = expandedArticleKey;
    void hydrateArticleContent(expandedArticle, { force: true });
  }, [
    autoHydratedExpandedKeyRef,
    distillStrategy,
    expandedArticle,
    expandedArticleKey,
    getFeedSettings,
    hydratingArticleLinks,
    hydrateArticleContent,
    previousDistillStrategyRef,
  ]);
}

function useExpandedArticleHydrationRestoreEffect({
  autoHydratedExpandedKeyRef,
  awaitingExpandedSyncKeyRef,
  expandedArticle,
  expandedArticleKey,
  hydrateArticleContent,
  hydratedArticleLinks,
  hydratingArticleLinks,
}: {
  autoHydratedExpandedKeyRef: React.RefObject<null | string>;
  awaitingExpandedSyncKeyRef: React.RefObject<null | string>;
  expandedArticle: Article | undefined;
  expandedArticleKey: null | string;
  hydrateArticleContent: UseExpandedArticleHydrationOptions["hydrateArticleContent"];
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
}) {
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

    const link = expandedArticle?.link.trim() ?? "";
    if (
      autoHydratedExpandedKeyRef.current !== expandedArticleKey &&
      expandedArticle &&
      link &&
      !expandedArticle.hasFullContent &&
      !hydratedArticleLinks[link] &&
      !hydratingArticleLinks[link]
    ) {
      autoHydratedExpandedKeyRef.current = expandedArticleKey;
      void hydrateArticleContent(expandedArticle);
    }
  }, [
    autoHydratedExpandedKeyRef,
    awaitingExpandedSyncKeyRef,
    expandedArticle,
    expandedArticleKey,
    hydratedArticleLinks,
    hydratingArticleLinks,
    hydrateArticleContent,
  ]);
}
