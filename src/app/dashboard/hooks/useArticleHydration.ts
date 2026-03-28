"use client";

import axios from "axios";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { type Article, ArticleService, isValidUrl } from "@/lib";
import { getPlaceholderSnapshotPathByArticleUrl } from "@/lib/core/placeholder";

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
      const link = article.link.trim();
      if (!link || !isValidUrl(link)) return;

      // Check per-feed extraction settings
      const feedUrl =
        typeof article.feedUrl === "string" ? article.feedUrl.trim() : "";
      const settings = feedUrl ? getFeedSettings?.(feedUrl) : undefined;
      const placeholderSnapshotPath = getPlaceholderSnapshotPathByArticleUrl(link);
      const shouldLoadStoredContent =
        settings?.extractionDisabled === true && placeholderSnapshotPath === null;

      const inFlightCount = articleHydrationInFlightRef.current.get(link) ?? 0;

      if (!forceHydration && article.hasFullContent) {
        return;
      }
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
        const nextContent = shouldLoadStoredContent
          ? await ArticleService.getStoredArticleContent(article.id)
          : await ArticleService.extractArticleContent(link, {
              distillStrategy,
              signal: abortController.signal,
              useProxy: settings?.proxyEnabled,
            });

        if (!nextContent) {
          if (!shouldLoadStoredContent) {
            setHydratedArticleLinks((current) => {
              if (!current[link]) return current;
              const { [link]: _, ...rest } = current;
              return rest;
            });
          }
          return;
        }

        setFeed((currentFeed) =>
          currentFeed.map((a) => {
            if (a.link.trim() !== link) return a;
            return { ...a, content: nextContent, hasFullContent: true };
          }),
        );

        if (!shouldLoadStoredContent) {
          setHydratedArticleLinks((current) => ({ ...current, [link]: true }));
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error("Article hydration error:", error);
        if (!shouldLoadStoredContent) {
          setHydratedArticleLinks((current) => {
            if (!current[link]) return current;
            const { [link]: _, ...rest } = current;
            return rest;
          });
        }
        const serverReason = (() => {
          if (!axios.isAxiosError<Record<string, unknown>>(error))
            return undefined;
          const data = error.response?.data;
          if (!data || typeof data !== "object") return undefined;
          const reason = data.reason;
          if (typeof reason === "string") {
            return reason;
          }
          const message = data.error;
          return typeof message === "string" ? message : undefined;
        })();
        toast.error(
          serverReason
            ? `${shouldLoadStoredContent ? "Unable to load article" : "Unable to extract article"}: ${serverReason}`
            : shouldLoadStoredContent
              ? "Unable to load article content right now."
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
