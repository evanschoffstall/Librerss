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

interface FinishArticleHydrationOptions {
  articleHydrationInFlightRef: ArticleHydrationState["articleHydrationInFlightRef"];
  hydrationAbortRef: ArticleHydrationState["hydrationAbortRef"];
  link: string;
  setHydratingArticleLinks: ArticleHydrationState["setHydratingArticleLinks"];
}

interface LoadHydratedArticleContentOptions {
  abortController: AbortController;
  article: Article;
  articleHydration: NonNullable<ReturnType<typeof prepareArticleHydration>>;
  distillStrategy: UseArticleHydrationOptions["distillStrategy"];
}

interface PrepareArticleHydrationOptions {
  article: Article;
  forceHydration: boolean;
  getFeedSettings: UseArticleHydrationOptions["getFeedSettings"];
  hydrationState: ArticleHydrationState;
}

interface ShouldHydrateArticleOptions {
  article: Article;
  forceHydration: boolean;
  hydratedArticleLinks: Record<string, boolean>;
  inFlightCount: number;
  link: string;
}
interface StartArticleHydrationOptions {
  articleHydrationInFlightRef: ArticleHydrationState["articleHydrationInFlightRef"];
  hydrationAbortRef: ArticleHydrationState["hydrationAbortRef"];
  inFlightCount: number;
  link: string;
  setHydratingArticleLinks: ArticleHydrationState["setHydratingArticleLinks"];
}

/**
 * Process the apply hydrated article content.
 * @param setFeed - The set feed.
 * @param link - The link.
 * @param nextContent - The next content.
 */
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
/**
 * Process the clear hydrated article link.
 * @param setHydratedArticleLinks - The set hydrated article links.
 * @param link - The link.
 */
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

/**
 * Process the clear hydrating article link.
 * @param setHydratingArticleLinks - The set hydrating article links.
 * @param link - The link.
 */
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

/**
 * Process the clear hydration cache on empty content.
 * @param articleHydration - The article hydration.
 * @param setHydratedArticleLinks - The set hydrated article links.
 */
export function clearHydrationCacheOnEmptyContent(
  articleHydration: NonNullable<ReturnType<typeof prepareArticleHydration>>,
  setHydratedArticleLinks: ArticleHydrationState["setHydratedArticleLinks"],
) {
  if (!articleHydration.shouldLoadStoredContent) {
    clearHydratedArticleLink(setHydratedArticleLinks, articleHydration.link);
  }
}
/**
 * Process the finish article hydration.
 * @param options - The options used to process the finish article hydration.
 */
export function finishArticleHydration(options: FinishArticleHydrationOptions) {
  const {
    articleHydrationInFlightRef,
    hydrationAbortRef,
    link,
    setHydratingArticleLinks,
  } = options;
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

/**
 * Process the load hydrated article content.
 * @param options - The options used to process the load hydrated article content.
 * @returns The load hydrated article content.
 */
export async function loadHydratedArticleContent(
  options: LoadHydratedArticleContentOptions,
) {
  const { abortController, article, articleHydration, distillStrategy } =
    options;
  return articleHydration.shouldLoadStoredContent
    ? ArticleService.getStoredArticleContent(article.id)
    : ArticleService.extractArticleContent(articleHydration.link, {
        distillStrategy,
        signal: abortController.signal,
        useProxy: articleHydration.settings?.proxyEnabled,
      });
}

/**
 * Process the mark hydrated article link.
 * @param articleHydration - The article hydration.
 * @param setHydratedArticleLinks - The set hydrated article links.
 */
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
/**
 * Resolve whether an article expansion should enter the client hydration
 * lifecycle. Extraction-disabled feeds that already shipped a feed-provided
 * body should keep that authoritative content instead of replacing it with a
 * temporary loading state. When the body is still absent, the hook may use
 * either the stored-content path or the placeholder-snapshot extract path.
 * @param options - Hydration inputs for the article and feed settings lookup.
 * @returns The request metadata when hydration should run, otherwise null.
 */
export function prepareArticleHydration(
  options: PrepareArticleHydrationOptions,
) {
  const { article, forceHydration, getFeedSettings, hydrationState } = options;
  const link = article.link.trim();
  if (!link || !isValidUrl(link)) return null;
  const feedUrl =
    typeof article.feedUrl === "string" ? article.feedUrl.trim() : "";
  const settings = feedUrl ? getFeedSettings?.(feedUrl) : undefined;
  if (settings?.extractionDisabled === true && article.content.trim()) {
    return null;
  }

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

/**
 * Resolve the hydration failure message.
 * @param error - The error.
 * @param shouldLoadStoredContent - Whether should load stored content.
 * @returns The hydration failure message.
 */
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
/**
 * Return whether should hydrate article.
 * @param options - The options used to return whether should hydrate article.
 * @returns Whether should hydrate article.
 */
export function shouldHydrateArticle(options: ShouldHydrateArticleOptions) {
  const { article, forceHydration, hydratedArticleLinks, inFlightCount, link } =
    options;
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

/**
 * Process the start article hydration.
 * @param options - The options used to process the start article hydration.
 * @returns The start article hydration.
 */
export function startArticleHydration(options: StartArticleHydrationOptions) {
  const {
    articleHydrationInFlightRef,
    hydrationAbortRef,
    inFlightCount,
    link,
    setHydratingArticleLinks,
  } = options;
  articleHydrationInFlightRef.current.set(link, inFlightCount + 1);
  setHydratingArticleLinks((current) => ({ ...current, [link]: true }));
  const abortController = new AbortController();
  hydrationAbortRef.current.set(link, abortController);
  return abortController;
}

/**
 * Process the toast hydration failure.
 * @param error - The error.
 * @param shouldLoadStoredContent - Whether should load stored content.
 */
export function toastHydrationFailure(
  error: unknown,
  shouldLoadStoredContent: boolean,
) {
  toast.error(resolveHydrationFailureMessage(error, shouldLoadStoredContent));
}

/**
 * Normalize the hydration failure value.
 * @param value - The value.
 * @returns The hydration failure value.
 */
function normalizeHydrationFailureValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
/**
 * Parse the hydration failure payload.
 * @param payload - The payload.
 * @returns The hydration failure payload.
 */
function parseHydrationFailurePayload(payload: HydrationFailurePayload) {
  return {
    serverError: normalizeHydrationFailureValue(payload.error),
    serverReason: normalizeHydrationFailureValue(payload.reason),
  };
}
