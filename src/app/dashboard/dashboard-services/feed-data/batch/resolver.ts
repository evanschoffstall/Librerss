import type { FeedBatchSource } from "@/app/dashboard/dashboard-services/feed-data/batch";
import type { FeedFetchOptions } from "@/app/dashboard/dashboard-services/selection";
import type { BatchFeedResponseItem } from "@/lib/api/http";
import type { Article, ArticleFilter } from "@/lib/core";

import { filterArticlesByState } from "@/app/dashboard/dashboard-services/article";
import { FeedService } from "@/lib/api";
import { getPlaceholderArticlesForSource } from "@/lib/core";

interface FeedBatchResolverDependencies {
  fetchFeedsBatch: (
    urls: string[],
    options?: {
      articleFilter?: ArticleFilter;
      articleLimit?: number;
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

interface PlaceholderArticleCandidate {
  article: Article;
  sourceName: string | undefined;
  sourceUrl: string;
}

const defaultDependencies: FeedBatchResolverDependencies = {
  fetchFeedsBatch: (urls, options) => FeedService.getFeedsBatch(urls, options),
  getPlaceholderArticles: getPlaceholderArticlesForSource,
};

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
            .includes(normalizedSearchTerm);
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
    .sort((left, right) => {
      const publicationDateDelta =
        right.article.publicationDate.getTime() -
        left.article.publicationDate.getTime();

      if (publicationDateDelta !== 0) {
        return publicationDateDelta;
      }

      return right.article.id - left.article.id;
    });

  if (options?.articleLimit === undefined) {
    return filteredCandidates;
  }

  return filteredCandidates.slice(0, Math.max(0, options.articleLimit));
}

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
