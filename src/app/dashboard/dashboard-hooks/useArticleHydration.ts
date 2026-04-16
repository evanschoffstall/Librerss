"use client";

import { useCallback, useRef, useState } from "react";

import type { FeedExtractionSettings } from "@/app/dashboard/display-types";
import type { Article } from "@/lib/core";

import {
  applyHydratedArticleContent,
  type ArticleHydrationState,
  clearHydratingArticleLink,
  clearHydrationCacheOnEmptyContent,
  finishArticleHydration,
  loadHydratedArticleContent,
  markHydratedArticleLink,
  prepareArticleHydration,
  startArticleHydration,
  toastHydrationFailure,
} from "@/app/dashboard/dashboard-hooks/useArticleHydration.lifecycle";

export interface HydrationFailurePayload {
  error?: unknown;
  reason?: unknown;
}

export interface UseArticleHydrationOptions {
  distillStrategy?: string;
  getFeedSettings?: (feedUrl: string) => FeedExtractionSettings | undefined;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
}

interface HydrateArticleContentOptions {
  force?: boolean;
}

/** Safely escape an article key for use in a CSS attribute selector. */
export function escapeArticleKey(articleKey: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(articleKey)
    : articleKey.replace(/[\\"]/g, "\\$&");
}

/**
 * Hydrate article bodies on demand while preventing overlapping requests for
 * the same article link from committing stale state.
 */
export function useArticleHydration({
  distillStrategy,
  getFeedSettings,
  setFeed,
}: UseArticleHydrationOptions) {
  const hydrationState = useArticleHydrationState();
  const scrollArticleIntoView = useScrollArticleIntoView();
  const hydrateArticleContent = useHydrateArticleContent({
    distillStrategy,
    getFeedSettings,
    hydrationState,
    setFeed,
  });
  const cancelHydration = useCancelHydration(hydrationState);

  return {
    cancelHydration,
    hydrateArticleContent,
    hydratedArticleLinks: hydrationState.hydratedArticleLinks,
    hydratingArticleLinks: hydrationState.hydratingArticleLinks,
    scrollArticleIntoView,
  };
}

function useArticleHydrationState() {
  const [hydratedArticleLinks, setHydratedArticleLinks] = useState<
    Record<string, boolean>
  >({});
  const [hydratingArticleLinks, setHydratingArticleLinks] = useState<
    Record<string, boolean>
  >({});
  const articleHydrationInFlightRef = useRef(new Map<string, number>());
  const hydrationAbortRef = useRef(new Map<string, AbortController>());

  return {
    articleHydrationInFlightRef,
    hydratedArticleLinks,
    hydratingArticleLinks,
    hydrationAbortRef,
    setHydratedArticleLinks,
    setHydratingArticleLinks,
  } satisfies ArticleHydrationState;
}

function useCancelHydration(hydrationState: ArticleHydrationState) {
  return useCallback(
    (link: string) => {
      const controller = hydrationState.hydrationAbortRef.current.get(link);
      if (!controller) return;
      controller.abort();
      hydrationState.hydrationAbortRef.current.delete(link);
      hydrationState.articleHydrationInFlightRef.current.delete(link);
      clearHydratingArticleLink(hydrationState.setHydratingArticleLinks, link);
    },
    [hydrationState],
  );
}

function useHydrateArticleContent({
  distillStrategy,
  getFeedSettings,
  hydrationState,
  setFeed,
}: {
  distillStrategy: UseArticleHydrationOptions["distillStrategy"];
  getFeedSettings: UseArticleHydrationOptions["getFeedSettings"];
  hydrationState: ArticleHydrationState;
  setFeed: UseArticleHydrationOptions["setFeed"];
}) {
  return useCallback(
    async (article: Article, options?: HydrateArticleContentOptions) => {
      const articleHydration = prepareArticleHydration({
        article,
        forceHydration: options?.force ?? false,
        getFeedSettings,
        hydrationState,
      });
      if (!articleHydration) {
        return;
      }

      const abortController = startArticleHydration({
        articleHydrationInFlightRef: hydrationState.articleHydrationInFlightRef,
        hydrationAbortRef: hydrationState.hydrationAbortRef,
        inFlightCount: articleHydration.inFlightCount,
        link: articleHydration.link,
        setHydratingArticleLinks: hydrationState.setHydratingArticleLinks,
      });

      try {
        const nextContent = await loadHydratedArticleContent({
          abortController,
          article,
          articleHydration,
          distillStrategy,
        });
        if (!nextContent) {
          clearHydrationCacheOnEmptyContent(
            articleHydration,
            hydrationState.setHydratedArticleLinks,
          );
          return;
        }

        applyHydratedArticleContent(
          setFeed,
          articleHydration.link,
          nextContent,
        );
        markHydratedArticleLink(
          articleHydration,
          hydrationState.setHydratedArticleLinks,
        );
      } catch (error) {
        if (abortController.signal.aborted) return;
        clearHydrationCacheOnEmptyContent(
          articleHydration,
          hydrationState.setHydratedArticleLinks,
        );
        toastHydrationFailure(error, articleHydration.shouldLoadStoredContent);
      } finally {
        finishArticleHydration({
          articleHydrationInFlightRef:
            hydrationState.articleHydrationInFlightRef,
          hydrationAbortRef: hydrationState.hydrationAbortRef,
          link: articleHydration.link,
          setHydratingArticleLinks: hydrationState.setHydratingArticleLinks,
        });
      }
    },
    [distillStrategy, getFeedSettings, hydrationState, setFeed],
  );
}

function useScrollArticleIntoView() {
  return useCallback((articleKey: string) => {
    try {
      document
        .querySelector<HTMLElement>(
          `[data-article-key="${escapeArticleKey(articleKey)}"]`,
        )
        ?.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "nearest",
        });
    } catch {
      // invalid selector — skip
    }
  }, []);
}

/**
 * Convert a structured extract response failure into the toast copy the
 * dashboard should show for a handled hydration failure.
 */
