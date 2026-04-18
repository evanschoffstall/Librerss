import { and, desc, eq } from "drizzle-orm";

type DbMod = typeof import("@/lib/db");

export { withNormalizedArticleContent } from "@/lib/core";

type FeedSourcesTable = DbMod["feedSources"];
type FeedsTable = DbMod["feeds"];

interface UserOwnedArticle {
  content: null | string;
  feedId: number;
  id: number;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

/**
 * @param db
 * @param userId
 * @param articleId
 */
export async function getUserOwnedArticleById(
  db: ReturnType<DbMod["getDb"]>,
  userId: number,
  articleId: number,
): Promise<null | UserOwnedArticle> {
  const { articles, articleSelect, feedSourcesTable, feedsTable } =
    await loadArticleQueryContext();

  const articlesById = await db
    .select(articleSelect)
    .from(articles)
    .innerJoin(feedsTable, eq(feedsTable.id, articles.feedId))
    .innerJoin(
      feedSourcesTable,
      enabledFeedSourceJoin(userId, feedSourcesTable, feedsTable),
    )
    .where(eq(articles.id, articleId))
    .limit(1);

  return articlesById[0] ?? null;
}

/**
 * @param db
 * @param userId
 * @param limit
 */
export async function listUserOwnedArticles(
  db: ReturnType<DbMod["getDb"]>,
  userId: number,
  limit: number,
): Promise<UserOwnedArticle[]> {
  const { articles, articleSelect, feedSourcesTable, feedsTable } =
    await loadArticleQueryContext();

  return db
    .select(articleSelect)
    .from(articles)
    .innerJoin(feedsTable, eq(feedsTable.id, articles.feedId))
    .innerJoin(
      feedSourcesTable,
      enabledFeedSourceJoin(userId, feedSourcesTable, feedsTable),
    )
    .orderBy(desc(articles.publicationDate))
    .limit(limit);
}

/**
 * @param userId
 * @param feedSources
 * @param feeds
 */
function enabledFeedSourceJoin(
  userId: number,
  feedSources: FeedSourcesTable,
  feeds: FeedsTable,
) {
  return and(
    eq(feedSources.url, feeds.url),
    eq(feedSources.userId, userId),
    eq(feedSources.enabled, true),
  );
}

/**
 *
 */
async function loadArticleQueryContext() {
  const {
    articles,
    feeds: feedsTable,
    feedSources: feedSourcesTable,
  } = await import("@/lib/db");
  const articleSelect = {
    content: articles.content,
    feedId: articles.feedId,
    id: articles.id,
    lastChecked: articles.lastChecked,
    link: articles.link,
    publicationDate: articles.publicationDate,
    title: articles.title,
  };
  return { articles, articleSelect, feedSourcesTable, feedsTable };
}
