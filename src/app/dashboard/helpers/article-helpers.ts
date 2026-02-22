/**
 * Pure helpers for article deduplication and sorting.
 */

import { type Article } from "@/lib";

// ─── Article key ──────────────────────────────────────────────────────────────

export const getArticleKey = (article: Article) => article.link.trim();

// ─── Dedup & sort ─────────────────────────────────────────────────────────────

const getArticleContentLength = (article: Article) =>
  article.content?.length ?? 0;

const getArticleTimestamp = (article: Article) =>
  new Date(article.publicationDate).getTime();

const shouldReplaceArticle = (candidate: Article, current: Article) => {
  const candidateLen = getArticleContentLength(candidate);
  const currentLen = getArticleContentLength(current);
  if (candidateLen !== currentLen) return candidateLen > currentLen;
  return getArticleTimestamp(candidate) > getArticleTimestamp(current);
};

const sortByPublicationDateDesc = (a: Article, b: Article) =>
  getArticleTimestamp(b) - getArticleTimestamp(a);

export const dedupeAndSortArticles = (articles: Article[]): Article[] => {
  const uniqueArticles = new Map<string, Article>();

  for (const article of articles) {
    if (!article.link?.trim()) continue;

    const key = article.link.trim();
    const existing = uniqueArticles.get(key);

    if (!existing) {
      uniqueArticles.set(key, article);
      continue;
    }

    if (shouldReplaceArticle(article, existing)) {
      uniqueArticles.set(key, article);
    }
  }

  return [...uniqueArticles.values()].sort(sortByPublicationDateDesc);
};
