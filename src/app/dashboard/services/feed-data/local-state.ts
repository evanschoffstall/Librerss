import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/services/article-collection";

/**
 * Describes the placeholder article status stored across preview-mode refetches.
 */
interface PlaceholderArticleLocalState {
  isRead?: boolean;
}

const placeholderArticleLocalStateByKey = new Map<
  string,
  PlaceholderArticleLocalState
>();

/**
 * Describes the options for merge feed local state.
 */
interface MergeFeedLocalStateOptions {
  preserveLocalFeedState: boolean;
}

/**
 * Apply any locally persisted preview-mode read state to a placeholder article.
 * @param article - Placeholder article generated for the current batch request.
 * @returns Placeholder article with the stored local read state applied.
 */
export function applyPlaceholderArticleLocalState(article: Article): Article {
  const localState = placeholderArticleLocalStateByKey.get(
    getArticleKey(article),
  );

  if (localState?.isRead === undefined) {
    return article;
  }

  return article.isRead === localState.isRead
    ? article
    : { ...article, isRead: localState.isRead };
}

/**
 * Process the merge feed article local state.
 * @param currentArticle - The current article.
 * @param freshArticle - The fresh article.
 * @param options - The options used to process the merge feed article local state.
 * @returns The merge feed article local state.
 */
export function mergeFeedArticleLocalState(
  currentArticle: Article,
  freshArticle: Article,
  options: MergeFeedLocalStateOptions,
): Article {
  const mergedContent =
    currentArticle.content !== freshArticle.content
      ? currentArticle.content
      : freshArticle.content;
  const mergedHasFullContent: boolean | undefined =
    currentArticle.hasFullContent === true ? true : freshArticle.hasFullContent;
  const mergedIsRead = options.preserveLocalFeedState
    ? currentArticle.isRead
    : freshArticle.isRead;
  const mergedIsStarred = options.preserveLocalFeedState
    ? currentArticle.isStarred
    : freshArticle.isStarred;

  return mergedContent !== freshArticle.content ||
    mergedHasFullContent !== freshArticle.hasFullContent ||
    mergedIsRead !== freshArticle.isRead ||
    mergedIsStarred !== freshArticle.isStarred
    ? {
        ...freshArticle,
        content: mergedContent,
        hasFullContent: mergedHasFullContent,
        isRead: mergedIsRead,
        isStarred: mergedIsStarred,
      }
    : freshArticle;
}

/**
 * Clear persisted preview-mode article state between tests.
 */
export function resetPlaceholderArticleLocalStateForTesting(): void {
  placeholderArticleLocalStateByKey.clear();
}

/**
 * Process the retain missing previous feed articles.
 * @param previousFeed - The previous feed.
 * @param mergedFreshArticles - The merged fresh articles.
 * @returns The retain missing previous feed articles.
 */
export function retainMissingPreviousFeedArticles(
  previousFeed: Article[],
  mergedFreshArticles: Article[],
): Article[] {
  const mergedLinks = new Set(
    mergedFreshArticles
      .map((article) => article.link.trim())
      .filter((link) => link.length > 0),
  );
  const retainedPreviousArticles = previousFeed.filter((article) => {
    const link = article.link.trim();
    return link.length > 0 && !mergedLinks.has(link);
  });

  return retainedPreviousArticles.length === 0
    ? mergedFreshArticles
    : [...mergedFreshArticles, ...retainedPreviousArticles];
}

/**
 * Persist preview-mode read state so later placeholder refills reuse the
 * user's latest local intent instead of the static seed defaults.
 * @param articles - Placeholder-backed articles whose read state changed.
 * @param nextReadState - Read-state value to persist for future placeholder fetches.
 */
export function setPlaceholderArticleReadState(
  articles: Article[],
  nextReadState: boolean,
): void {
  for (const article of articles) {
    placeholderArticleLocalStateByKey.set(getArticleKey(article), {
      isRead: nextReadState,
    });
  }
}
