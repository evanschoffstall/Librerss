"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { type Article, ArticleService, isValidUrl } from "@/lib";
import { isApiError } from "@/lib/api/http";
import { getPlaceholderSnapshotPathByArticleUrl } from "@/lib/core/placeholder";

export interface FeedExtractionSettings {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
}

interface HydrateArticleContentOptions {
  force?: boolean;
}

interface HydrationFailurePayload {
  error?: unknown;
  reason?: unknown;
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

/**
 * Hydrate article bodies on demand while preventing overlapping requests for
 * the same article link from committing stale state.
 */
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
        if (!shouldLoadStoredContent) {
          setHydratedArticleLinks((current) => {
            if (!current[link]) return current;
            const { [link]: _, ...rest } = current;
            return rest;
          });
        }
        toast.error(resolveHydrationFailureMessage(error, shouldLoadStoredContent));
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

/**
 * Convert a structured extract response failure into the toast copy the
 * dashboard should show for a handled hydration failure.
 */
function resolveHydrationFailureMessage(
  error: unknown,
  shouldLoadStoredContent: boolean,
): string {
  const fallbackMessage = shouldLoadStoredContent
    ? "Unable to load article content right now."
    : "Unable to extract article content right now.";

  if (!isApiError<HydrationFailurePayload>(error)) {
    return fallbackMessage;
  }

  const payload = error.response?.data;
  if (!payload || typeof payload !== "object") {
    return fallbackMessage;
  }

  const serverError =
    typeof payload.error === "string" && payload.error.trim().length > 0
      ? payload.error.trim()
      : undefined;
  const serverReason =
    typeof payload.reason === "string" && payload.reason.trim().length > 0
      ? payload.reason.trim()
      : undefined;

  if (serverError && serverReason && serverReason !== serverError) {
    return `${serverError}: ${serverReason}`;
  }

  return serverError ?? serverReason ?? fallbackMessage;
}
