"use client";

import axios from "axios";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { type Article, ArticleService, isValidUrl } from "@/lib";

export interface FeedExtractionSettings {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
}

interface HydrateArticleContentOptions {
  force?: boolean;
}

interface UseArticleHydrationOptions {
  distillStrategy?: string;
  getFeedSettings?: (feedUrl: string) => FeedExtractionSettings | undefined;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
}

/** Safely escape an article key for use in a CSS attribute selector. */
export function escapeArticleKey(articleKey: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(articleKey)
    : articleKey.replace(/[\\"]/g, "\\$&");
}

export function useArticleHydration({
  distillStrategy,
  getFeedSettings,
  setFeed,
}: UseArticleHydrationOptions) {
  const [hydratedArticleLinks, setHydratedArticleLinks] = useState<
    Record<string, boolean>
  >({});
  const [hydratingArticleLinks, setHydratingArticleLinks] = useState<
    Record<string, boolean>
  >({});
  const articleHydrationInFlightRef = useRef(new Map<string, number>());
  const hydrationAbortRef = useRef(new Map<string, AbortController>());

  const scrollArticleIntoView = useCallback((articleKey: string) => {
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

  const hydrateArticleContent = useCallback(
    async (article: Article, options?: HydrateArticleContentOptions) => {
      const forceHydration = options?.force ?? false;
      const link = article.link?.trim();
      if (!link || !isValidUrl(link)) return;

      // Check per-feed extraction settings
      const feedUrl = article.feedUrl?.trim();
      const settings = feedUrl ? getFeedSettings?.(feedUrl) : undefined;
      if (settings?.extractionDisabled) return;

      const inFlightCount = articleHydrationInFlightRef.current.get(link) ?? 0;

      if (!forceHydration && hydratedArticleLinks[link]) {
        console.info("[dashboard] Article hydration cache hit", { link });
        return;
      }
      if (!forceHydration && inFlightCount > 0) return;

      articleHydrationInFlightRef.current.set(link, inFlightCount + 1);
      setHydratingArticleLinks((current) => ({ ...current, [link]: true }));

      const abortController = new AbortController();
      hydrationAbortRef.current.set(link, abortController);

      try {
        const extractedContent = await ArticleService.extractArticleContent(
          link,
          {
            distillStrategy,
            signal: abortController.signal,
            useProxy: settings?.proxyEnabled,
          },
        );

        if (!extractedContent) {
          setHydratedArticleLinks((current) => {
            if (!current[link]) return current;
            const { [link]: _, ...rest } = current;
            return rest;
          });
          return;
        }

        setFeed((currentFeed) =>
          currentFeed.map((a) => {
            if (a.link.trim() !== link) return a;
            return { ...a, content: extractedContent };
          }),
        );

        setHydratedArticleLinks((current) => ({ ...current, [link]: true }));
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error("Article hydration error:", error);
        setHydratedArticleLinks((current) => {
          if (!current[link]) return current;
          const { [link]: _, ...rest } = current;
          return rest;
        });
        const serverReason = (() => {
          if (!axios.isAxiosError(error)) return undefined;
          const data = error.response?.data;
          if (!data || typeof data !== "object") return undefined;
          const dataRecord = data as Record<string, unknown>;
          const reason = dataRecord.reason;
          if (typeof reason === "string") {
            return reason;
          }
          const message = dataRecord.error;
          return typeof message === "string" ? message : undefined;
        })();
        toast.error(
          serverReason
            ? `Unable to extract article: ${serverReason}`
            : "Unable to extract article content right now.",
        );
      } finally {
        hydrationAbortRef.current.delete(link);
        const remainingInFlight =
          (articleHydrationInFlightRef.current.get(link) ?? 1) - 1;

        if (remainingInFlight <= 0) {
          articleHydrationInFlightRef.current.delete(link);
          setHydratingArticleLinks((current) => {
            if (!current[link]) return current;
            const { [link]: _, ...rest } = current;
            return rest;
          });
        } else {
          articleHydrationInFlightRef.current.set(link, remainingInFlight);
        }
      }
    },
    [hydratedArticleLinks, setFeed, getFeedSettings, distillStrategy],
  );

  const cancelHydration = useCallback((link: string) => {
    const controller = hydrationAbortRef.current.get(link);
    if (!controller) return;
    controller.abort();
    hydrationAbortRef.current.delete(link);
    articleHydrationInFlightRef.current.delete(link);
    setHydratingArticleLinks((current) => {
      if (!current[link]) return current;
      const { [link]: _, ...rest } = current;
      return rest;
    });
  }, []);

  return {
    cancelHydration,
    hydrateArticleContent,
    hydratedArticleLinks,
    hydratingArticleLinks,
    scrollArticleIntoView,
  };
}
