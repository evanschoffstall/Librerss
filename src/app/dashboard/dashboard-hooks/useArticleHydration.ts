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

/**
 * Describes the hydration failure payload.
 */
export interface HydrationFailurePayload {
  error?: unknown;
  reason?: unknown;
}

/**
 * Describes the options for use article hydration.
 */
export interface UseArticleHydrationOptions {
  distillStrategy?: string;
  getFeedSettings?: (feedUrl: string) => FeedExtractionSettings | undefined;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
}

/**
 * Describes the options for hydrate article content.
 */
interface HydrateArticleContentOptions {
  force?: boolean;
}

/**
 * Describes the hydrate article content options2.
 */
interface HydrateArticleContentOptions2 {
  distillStrategy: UseArticleHydrationOptions["distillStrategy"];
  getFeedSettings: UseArticleHydrationOptions["getFeedSettings"];
  hydrationState: ArticleHydrationState;
  setFeed: UseArticleHydrationOptions["setFeed"];
}

/**
 * Process the escape article key.
 * @param articleKey - The article key.
 * @returns The escape article key.
 */
export function escapeArticleKey(articleKey: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(articleKey)
    : articleKey.replace(/[\\"]/g, "\\$&");
}

/**
 * Manage the article hydration.
 * @param options - The options used to manage the article hydration.
 * @returns The article hydration state and callbacks.
 */
export function useArticleHydration(options: UseArticleHydrationOptions) {
  const { distillStrategy, getFeedSettings, setFeed } = options;
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

/**
 * Manage the article hydration state.
 * @returns The article hydration state state and callbacks.
 */
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
/**
 * Manage the cancel hydration.
 * @param hydrationState - The hydration state.
 * @returns The cancel hydration state and callbacks.
 */
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

/**
 * Manage the hydrate article content.
 * @param options - The options used to manage the hydrate article content.
 * @returns The hydrate article content state and callbacks.
 */
function useHydrateArticleContent(options: HydrateArticleContentOptions2) {
  const { distillStrategy, getFeedSettings, hydrationState, setFeed } = options;
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

/**
 * Manage the scroll article into view.
 * @returns The scroll article into view state and callbacks.
 */
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
