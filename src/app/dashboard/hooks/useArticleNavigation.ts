type ArticleLike = { id: number };

export function getNextArticle<T extends ArticleLike>(
  articles: T[],
  currentId: number,
): T | null {
  const index = articles.findIndex((article) => article.id === currentId);
  if (index < 0 || index >= articles.length - 1) {
    return null;
  }
  return articles[index + 1] ?? null;
}

export function getPreviousArticle<T extends ArticleLike>(
  articles: T[],
  currentId: number,
): T | null {
  const index = articles.findIndex((article) => article.id === currentId);
  if (index <= 0) {
    return null;
  }
  return articles[index - 1] ?? null;
}
