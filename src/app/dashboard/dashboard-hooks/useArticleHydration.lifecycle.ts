import { toast } from "sonner";

import type {
  HydrationFailurePayload,
  UseArticleHydrationOptions,
} from "@/app/dashboard/dashboard-hooks/useArticleHydration";
import type { Article } from "@/lib/core";

import { ArticleService } from "@/lib/api";
import { isApiError } from "@/lib/api/http";
import { getPlaceholderSnapshotPathByArticleUrl } from "@/lib/core";
import { isValidUrl } from "@/lib/utils";

export interface ArticleHydrationState {
  articleHydrationInFlightRef: React.RefObject<Map<string, number>>;
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  hydrationAbortRef: React.RefObject<Map<string, AbortController>>;
  setHydratedArticleLinks: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  setHydratingArticleLinks: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
}

export function applyHydratedArticleContent(
  setFeed: UseArticleHydrationOptions["setFeed"],
  link: string,
  nextContent: string,
) {
  setFeed((currentFeed) =>
    currentFeed.map((article) =>
      article.link.trim() !== link
        ? article
        : { ...article, content: nextContent, hasFullContent: true },
    ),
  );
}

export function clearHydratedArticleLink(
  setHydratedArticleLinks: ArticleHydrationState["setHydratedArticleLinks"],
  link: string,
) {
  setHydratedArticleLinks((current) => {
    if (!current[link]) return current;
    const { [link]: _, ...rest } = current;
    return rest;
  });
}

export function clearHydratingArticleLink(
  setHydratingArticleLinks: ArticleHydrationState["setHydratingArticleLinks"],
  link: string,
) {
  setHydratingArticleLinks((current) => {
    if (!current[link]) return current;
    const { [link]: _, ...rest } = current;
    return rest;
  });
}

export function clearHydrationCacheOnEmptyContent(
  articleHydration: NonNullable<ReturnType<typeof prepareArticleHydration>>,
  setHydratedArticleLinks: ArticleHydrationState["setHydratedArticleLinks"],
) {
  if (!articleHydration.shouldLoadStoredContent) {
    clearHydratedArticleLink(setHydratedArticleLinks, articleHydration.link);
  }
}

export function finishArticleHydration({
  articleHydrationInFlightRef,
  hydrationAbortRef,
  link,
  setHydratingArticleLinks,
}: {
  articleHydrationInFlightRef: ArticleHydrationState["articleHydrationInFlightRef"];
  hydrationAbortRef: ArticleHydrationState["hydrationAbortRef"];
  link: string;
  setHydratingArticleLinks: ArticleHydrationState["setHydratingArticleLinks"];
}) {
  hydrationAbortRef.current.delete(link);
  const remainingInFlight =
    (articleHydrationInFlightRef.current.get(link) ?? 1) - 1;
  if (remainingInFlight <= 0) {
    articleHydrationInFlightRef.current.delete(link);
    clearHydratingArticleLink(setHydratingArticleLinks, link);
    return;
  }

  articleHydrationInFlightRef.current.set(link, remainingInFlight);
}

export async function loadHydratedArticleContent({
  abortController,
  article,
  articleHydration,
  distillStrategy,
}: {
  abortController: AbortController;
  article: Article;
  articleHydration: NonNullable<ReturnType<typeof prepareArticleHydration>>;
  distillStrategy: UseArticleHydrationOptions["distillStrategy"];
}) {
  return articleHydration.shouldLoadStoredContent
    ? ArticleService.getStoredArticleContent(article.id)
    : ArticleService.extractArticleContent(articleHydration.link, {
        distillStrategy,
        signal: abortController.signal,
        useProxy: articleHydration.settings?.proxyEnabled,
      });
}

export function markHydratedArticleLink(
  articleHydration: NonNullable<ReturnType<typeof prepareArticleHydration>>,
  setHydratedArticleLinks: ArticleHydrationState["setHydratedArticleLinks"],
) {
  if (!articleHydration.shouldLoadStoredContent) {
    setHydratedArticleLinks((current) => ({
      ...current,
      [articleHydration.link]: true,
    }));
  }
}

export function prepareArticleHydration({
  article,
  forceHydration,
  getFeedSettings,
  hydrationState,
}: {
  article: Article;
  forceHydration: boolean;
  getFeedSettings: UseArticleHydrationOptions["getFeedSettings"];
  hydrationState: ArticleHydrationState;
}) {
  const link = article.link.trim();
  if (!link || !isValidUrl(link)) return null;
  const feedUrl =
    typeof article.feedUrl === "string" ? article.feedUrl.trim() : "";
  const settings = feedUrl ? getFeedSettings?.(feedUrl) : undefined;
  const placeholderSnapshotPath = getPlaceholderSnapshotPathByArticleUrl(link);
  const shouldLoadStoredContent =
    settings?.extractionDisabled === true && placeholderSnapshotPath === null;
  const inFlightCount =
    hydrationState.articleHydrationInFlightRef.current.get(link) ?? 0;
  if (
    !shouldHydrateArticle({
      article,
      forceHydration,
      hydratedArticleLinks: hydrationState.hydratedArticleLinks,
      inFlightCount,
      link,
    })
  ) {
    return null;
  }

  return { inFlightCount, link, settings, shouldLoadStoredContent };
}

export function resolveHydrationFailureMessage(
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

  const { serverError, serverReason } = parseHydrationFailurePayload(payload);
  if (serverError && serverReason && serverReason !== serverError) {
    return `${serverError}: ${serverReason}`;
  }

  return serverError ?? serverReason ?? fallbackMessage;
}

export function shouldHydrateArticle({
  article,
  forceHydration,
  hydratedArticleLinks,
  inFlightCount,
  link,
}: {
  article: Article;
  forceHydration: boolean;
  hydratedArticleLinks: Record<string, boolean>;
  inFlightCount: number;
  link: string;
}) {
  if (forceHydration) return true;
  if (article.hasFullContent) return false;
  if (hydratedArticleLinks[link]) {
    if (
      process.env.NODE_ENV !== "test" ||
      process.env.ENABLE_TEST_LOG_OUTPUT === "true"
    ) {
      console.info("[dashboard] Article hydration cache hit", { link });
    }
    return false;
  }

  return inFlightCount <= 0;
}

export function startArticleHydration({
  articleHydrationInFlightRef,
  hydrationAbortRef,
  inFlightCount,
  link,
  setHydratingArticleLinks,
}: {
  articleHydrationInFlightRef: ArticleHydrationState["articleHydrationInFlightRef"];
  hydrationAbortRef: ArticleHydrationState["hydrationAbortRef"];
  inFlightCount: number;
  link: string;
  setHydratingArticleLinks: ArticleHydrationState["setHydratingArticleLinks"];
}) {
  articleHydrationInFlightRef.current.set(link, inFlightCount + 1);
  setHydratingArticleLinks((current) => ({ ...current, [link]: true }));
  const abortController = new AbortController();
  hydrationAbortRef.current.set(link, abortController);
  return abortController;
}

export function toastHydrationFailure(
  error: unknown,
  shouldLoadStoredContent: boolean,
) {
  toast.error(resolveHydrationFailureMessage(error, shouldLoadStoredContent));
}

function normalizeHydrationFailureValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
function parseHydrationFailurePayload(payload: HydrationFailurePayload) {
  return {
    serverError: normalizeHydrationFailureValue(payload.error),
    serverReason: normalizeHydrationFailureValue(payload.reason),
  };
}
