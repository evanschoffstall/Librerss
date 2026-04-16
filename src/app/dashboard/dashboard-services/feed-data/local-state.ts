import type { Article } from "@/lib/core";

interface MergeFeedLocalStateOptions {
  preserveLocalFeedState: boolean;
}

/** Merges display-relevant local state from the current article into the fresh article. */
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

/** Keeps already-loaded older articles when background refreshes only return the latest slice. */
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
