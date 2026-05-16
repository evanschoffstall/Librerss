import { and, desc, eq } from "drizzle-orm";

/**
 * Defines the DB mod type.
 */
type DbMod = typeof import("@/lib/db");

export { withNormalizedArticleContent } from "@/lib/core";

/**
 * Defines the feed sources table type.
 */
type FeedSourcesTable = DbMod["feedSources"];
/**
 * Defines the feeds table type.
 */
type FeedsTable = DbMod["feeds"];

/**
 * Describes the user owned article.
 */
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
 * Return the user owned article by id.
 * @param db - The db.
 * @param userId - The user ID.
 * @param articleId - The article id.
 * @returns The user owned article by id.
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
 * Process the list user owned articles.
 * @param db - The db.
 * @param userId - The user ID.
 * @param limit - The limit.
 * @returns The list user owned articles.
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
 * Process the enabled feed source join.
 * @param userId - The user ID.
 * @param feedSources - The feed sources.
 * @param feeds - The feeds.
 * @returns The enabled feed source join.
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
 * Process the load article query context.
 * @returns The load article query context.
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
