import type { FeedBatchSource } from "@/app/dashboard/dashboard-services/feed-data/batch";
import type { FeedFetchOptions } from "@/app/dashboard/dashboard-services/selection";
import type { BatchFeedResponseItem } from "@/lib/api/http";
import type { Article, ArticleFilter, ArticleSortOrder } from "@/lib/core";

import { filterArticlesByState } from "@/app/dashboard/dashboard-services/article";
import { FeedService } from "@/lib/api";
import { getPlaceholderArticlesForSource } from "@/lib/core";

/**
 * Describes the feed batch resolver dependencies.
 */
interface FeedBatchResolverDependencies {
  fetchFeedsBatch: (
    urls: string[],
    options?: {
      articleFilter?: ArticleFilter;
      articleLimit?: number;
      articleSortOrder?: ArticleSortOrder;
      forceRefresh?: boolean;
      forceResolveUpstream?: boolean;
      knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
      requestSource?: FeedFetchOptions["requestSource"];
      searchTerm?: string;
      signal?: AbortSignal;
      skipRefresh?: boolean;
    },
  ) => Promise<BatchFeedResponseItem[]>;
  getPlaceholderArticles: (url: string) => Article[];
}

/**
 * Describes the placeholder article candidate.
 */
interface PlaceholderArticleCandidate {
  article: Article;
  sourceName: string | undefined;
  sourceUrl: string;
}

const defaultDependencies: FeedBatchResolverDependencies = {
  /**
   * Process the fetch feeds batch.
   * @param urls - The urls.
   * @param options - The options used to process the fetch feeds batch.
   * @returns The fetch feeds batch.
   */
  fetchFeedsBatch: (urls, options) => FeedService.getFeedsBatch(urls, options),
  getPlaceholderArticles: getPlaceholderArticlesForSource,
};

/**
 * Resolve the feed batch results.
 * @param normalizedSources - The normalized sources.
 * @param usePlaceholderData - The placeholder data.
 * @param options - The options used to resolve the feed batch results.
 * @param signal - The signal.
 * @param dependencies - The dependencies.
 * @returns The feed batch results.
 */
export async function resolveFeedBatchResults(
  normalizedSources: FeedBatchSource[],
  usePlaceholderData: boolean,
  options?: FeedFetchOptions,
  signal?: AbortSignal,
  dependencies: FeedBatchResolverDependencies = defaultDependencies,
): Promise<BatchFeedResponseItem[]> {
  if (usePlaceholderData) {
    return resolvePlaceholderBatchResults(
      normalizedSources,
      dependencies.getPlaceholderArticles,
      options,
    );
  }

  return dependencies.fetchFeedsBatch(
    normalizedSources.map((source) => source.url),
    {
      articleFilter: options?.articleFilter,
      articleLimit: options?.articleLimit,
      articleSortOrder: options?.articleSortOrder,
      ...(options?.forceResolveUpstream === true
        ? { forceResolveUpstream: true }
        : {}),
      forceRefresh: options?.forceRefresh === true,
      knownLastFetchedAtByUrl: options?.knownLastFetchedAtByUrl,
      requestSource: options?.requestSource,
      searchTerm: options?.searchTerm,
      signal,
      skipRefresh: options?.skipRefresh ?? false,
    },
  );
}

/**
 * Compare placeholder article candidates before applying an article-window
 * limit. Placeholder mode has no database query to choose the global oldest or
 * newest window, so its in-memory resolver must apply the same chronological
 * contract before slicing the candidate set.
 * @param leftCandidate - The first placeholder candidate in the comparison.
 * @param rightCandidate - The second placeholder candidate in the comparison.
 * @param articleSortOrder - The requested chronological display order.
 * @returns A negative number when the left candidate should appear first.
 */
function comparePlaceholderArticlesBySortOrder(
  leftCandidate: PlaceholderArticleCandidate,
  rightCandidate: PlaceholderArticleCandidate,
  articleSortOrder: ArticleSortOrder,
): number {
  const publicationDateDelta =
    leftCandidate.article.publicationDate.getTime() -
    rightCandidate.article.publicationDate.getTime();
  const articleIdDelta = leftCandidate.article.id - rightCandidate.article.id;
  const ascendingDelta = publicationDateDelta || articleIdDelta;

  return articleSortOrder === "oldest" ? ascendingDelta : -ascendingDelta;
}

/**
 * Resolve the limited placeholder candidates.
 * @param normalizedSources - The normalized sources.
 * @param getPlaceholderArticles - Callback that returns placeholder articles for a given feed URL.
 * @param options - The options used to resolve the limited placeholder candidates.
 * @returns The limited placeholder candidates.
 */
function resolveLimitedPlaceholderCandidates(
  normalizedSources: FeedBatchSource[],
  getPlaceholderArticles: (url: string) => Article[],
  options?: FeedFetchOptions,
): PlaceholderArticleCandidate[] {
  const normalizedSearchTerm = options?.searchTerm?.trim().toLowerCase() ?? "";
  const filteredCandidates = normalizedSources
    .flatMap((source) =>
      getPlaceholderArticles(source.url).map((article) => ({
        article,
        sourceName: source.name,
        sourceUrl: source.url,
      })),
    )
    .filter((candidate) => {
      if (normalizedSearchTerm.length > 0) {
        const matchesSearch =
          candidate.article.title
            .toLowerCase()
            .includes(normalizedSearchTerm) ||
          candidate.article.content
            .toLowerCase()
            .includes(normalizedSearchTerm) ||
          candidate.article.link.toLowerCase().includes(normalizedSearchTerm) ||
          candidate.sourceName?.toLowerCase().includes(normalizedSearchTerm) ===
            true ||
          candidate.sourceUrl.toLowerCase().includes(normalizedSearchTerm);
        if (!matchesSearch) {
          return false;
        }
      }

      if (!options?.articleFilter) {
        return true;
      }

      const filteredArticles = filterArticlesByState(
        [candidate.article],
        options.articleFilter,
        null,
        [],
      );

      return filteredArticles.length > 0;
    })
    .sort((leftCandidate, rightCandidate) =>
      comparePlaceholderArticlesBySortOrder(
        leftCandidate,
        rightCandidate,
        options?.articleSortOrder ?? "newest",
      ),
    );

  if (options?.articleLimit === undefined) {
    return filteredCandidates;
  }

  return filteredCandidates.slice(0, Math.max(0, options.articleLimit));
}

/**
 * Resolve the placeholder batch results.
 * @param normalizedSources - The normalized sources.
 * @param getPlaceholderArticles - Callback that returns placeholder articles for a given feed URL.
 * @param options - The options used to resolve the placeholder batch results.
 * @returns The placeholder batch results.
 */
function resolvePlaceholderBatchResults(
  normalizedSources: FeedBatchSource[],
  getPlaceholderArticles: (url: string) => Article[],
  options?: FeedFetchOptions,
) {
  const limitedCandidates = resolveLimitedPlaceholderCandidates(
    normalizedSources,
    getPlaceholderArticles,
    options,
  );
  const articlesBySourceUrl = new Map<string, Article[]>();

  for (const candidate of limitedCandidates) {
    const existingArticles = articlesBySourceUrl.get(candidate.sourceUrl);
    const hydratedArticle = {
      ...candidate.article,
      feedName: candidate.sourceName,
      feedUrl: candidate.sourceUrl,
    };

    if (!existingArticles) {
      articlesBySourceUrl.set(candidate.sourceUrl, [hydratedArticle]);
      continue;
    }

    existingArticles.push(hydratedArticle);
  }

  return normalizedSources.map((source) => ({
    articles: articlesBySourceUrl.get(source.url) ?? [],
    ok: true,
    url: source.url,
  }));
}
