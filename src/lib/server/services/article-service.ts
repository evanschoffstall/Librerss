import { and, eq } from "drizzle-orm";

import { CONFIG, ServerServiceError } from "@/lib";
import { withNormalizedArticleContent } from "@/lib/core";
import { isAllowedFeedUrl } from "@/lib/core/feed-url-validator";
/**
 * Server-side article operations shared across API surfaces.
 *
 * Transport-agnostic: accepts typed params, returns data or throws
 * {@link ServerServiceError}. Both the REST API and future GReader API call
 * these functions.
 */
import { RUNTIME_FLAGS } from "@/lib/core/placeholder";
import {
  getUserOwnedArticleById,
  invalidateUserCache,
  listUserOwnedArticles,
  markStreamAsRead,
  upsertArticleStatuses,
} from "@/lib/core/server";
import { articles, feeds, feedSources, getDb } from "@/lib/db";
import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
} from "@/lib/sanitize";

/**
 * Describes the create article params.
 */
export interface CreateArticleParams {
  content: string;
  feedId: number;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

/**
 * Describes the status update.
 */
export interface StatusUpdate {
  isRead?: boolean;
  isStarred?: boolean;
}

/**
 * Describes the article service deps.
 */
interface ArticleServiceDeps {
  getDbFn?: typeof getDb;
  getUserOwnedArticleByIdFn?: typeof getUserOwnedArticleById;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  upsertArticleStatusesFn?: typeof upsertArticleStatuses;
}

/**
 * Create the article.
 * @param userId - The user ID.
 * @param params - The params.
 * @param deps - The deps.
 * @returns The article.
 */
export async function createArticle(
  userId: number,
  params: CreateArticleParams,
  deps: Pick<ArticleServiceDeps, "getDbFn" | "isAllowedFeedUrlFn"> = {},
) {
  const isAllowed = deps.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  if (!(await isAllowed(params.link))) {
    throw new ServerServiceError(
      "Article link must resolve to a public host",
      400,
    );
  }

  const db = (deps.getDbFn ?? getDb)();
  await assertUserOwnsFeed(db, userId, params.feedId);

  const rows = await db
    .insert(articles)
    .values(buildArticleInsertValues(params))
    .returning();

  return rows[0];
}

/**
 * Return the article by id.
 * @param userId - The user ID.
 * @param articleId - The article id.
 * @param deps - The deps.
 * @returns The article by id.
 */
export async function getArticleById(
  userId: number,
  articleId: number,
  deps: Pick<ArticleServiceDeps, "getDbFn"> = {},
) {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    throw new ServerServiceError("Article not found", 404);
  }

  const db = (deps.getDbFn ?? getDb)();
  const article = await getUserOwnedArticleById(db, userId, articleId);
  if (!article) throw new ServerServiceError("Article not found", 404);
  return withNormalizedArticleContent(article);
}

/**
 * Process the list user articles.
 * @param userId - The user ID.
 * @param deps - The deps.
 * @returns The list user articles.
 */
export async function listUserArticles(
  userId: number,
  deps: Pick<ArticleServiceDeps, "getDbFn"> = {},
) {
  if (RUNTIME_FLAGS.usePlaceholderData) return [];

  const db = (deps.getDbFn ?? getDb)();
  const rows = await listUserOwnedArticles(
    db,
    userId,
    CONFIG.MAX_ALL_ARTICLES_LIMIT,
  );
  return rows.map(withNormalizedArticleContent);
}

/**
 * Process the mark stream read.
 * @param userId - The user ID.
 * @param streamId - The stream id.
 */
export async function markStreamRead(userId: number, streamId: string) {
  await markStreamAsRead(userId, streamId);
  invalidateUserCache(userId);
}

/**
 * Update the article status.
 * @param userId - The user ID.
 * @param articleId - The article id.
 * @param updates - The read/starred status fields to update.
 * @param deps - The deps.
 */
export async function updateArticleStatus(
  userId: number,
  articleId: number,
  updates: StatusUpdate,
  deps: Pick<
    ArticleServiceDeps,
    "getUserOwnedArticleByIdFn" | "upsertArticleStatusesFn"
  > = {},
) {
  const getOwned = deps.getUserOwnedArticleByIdFn ?? getUserOwnedArticleById;
  const upsert = deps.upsertArticleStatusesFn ?? upsertArticleStatuses;

  const db = getDb();
  const article = await getOwned(db, userId, articleId);
  if (!article) throw new ServerServiceError("Article not found", 404);

  await upsert(userId, [articleId], updates);
  invalidateUserCache(userId);
}

/**
 * Process the assert user owns feed.
 * @param db - The db.
 * @param userId - The user ID.
 * @param feedId - The feed id.
 */
async function assertUserOwnsFeed(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedId: number,
): Promise<void> {
  const ownedFeeds = await db
    .select({ id: feeds.id })
    .from(feeds)
    .innerJoin(
      feedSources,
      and(
        eq(feedSources.url, feeds.url),
        eq(feedSources.userId, userId),
        eq(feedSources.enabled, true),
      ),
    )
    .where(eq(feeds.id, feedId))
    .limit(1);

  if (ownedFeeds.length === 0) {
    throw new ServerServiceError("Feed not found for authenticated user", 403);
  }
}

/**
 * Build the article insert values.
 * @param params - The params.
 * @returns The article insert values.
 */
function buildArticleInsertValues(params: CreateArticleParams) {
  return {
    content: sanitizeAndTruncateArticleContent(params.content),
    feedId: params.feedId,
    lastChecked: params.lastChecked,
    link: params.link,
    publicationDate: params.publicationDate,
    title: sanitizeArticleTitle(params.title),
  };
}
