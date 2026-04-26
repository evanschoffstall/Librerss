import type { Article } from "@/lib/core";

/**
 * Describes the options for merge feed local state.
 */
interface MergeFeedLocalStateOptions {
  preserveLocalFeedState: boolean;
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
