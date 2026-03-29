/**
 * Server-side article operations shared across API surfaces.
 *
 * Transport-agnostic: accepts typed params, returns data or throws
 * {@link ServerServiceError}. Both the REST API and future GReader API call
 * these functions.
 */
import { and, eq } from "drizzle-orm";

import { CONFIG } from "@/lib/config";
import {
  getUserOwnedArticleById,
  listUserOwnedArticles,
  withNormalizedArticleContent,
} from "@/lib/core/article-records";
import { upsertArticleStatuses } from "@/lib/core/article-status";
import { invalidateUserCache } from "@/lib/core/feed-cache";
import { isAllowedFeedUrl } from "@/lib/core/feed-url-validator";
import { markStreamAsRead } from "@/lib/core/mark-stream-read";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { articles, feeds, feedSources } from "@/lib/db/schema";
import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
} from "@/lib/sanitize";

import { ServerServiceError } from "./errors";

export interface CreateArticleParams {
  content: string;
  feedId: number;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

export interface StatusUpdate {
  isRead?: boolean;
  isStarred?: boolean;
}

interface ArticleServiceDeps {
  getDbFn?: typeof getDb;
  getUserOwnedArticleByIdFn?: typeof getUserOwnedArticleById;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  upsertArticleStatusesFn?: typeof upsertArticleStatuses;
}

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

  const title = sanitizeArticleTitle(params.title);
  const content = sanitizeAndTruncateArticleContent(params.content);

  const db = (deps.getDbFn ?? getDb)();
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
    .where(eq(feeds.id, params.feedId))
    .limit(1);

  if (ownedFeeds.length === 0) {
    throw new ServerServiceError("Feed not found for authenticated user", 403);
  }

  const rows = await db
    .insert(articles)
    .values({
      content,
      feedId: params.feedId,
      lastChecked: params.lastChecked,
      link: params.link,
      publicationDate: params.publicationDate,
      title,
    })
    .returning();

  return rows[0];
}

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

export async function markStreamRead(
  userId: number,
  streamId: string,
) {
  await markStreamAsRead(userId, streamId);
  invalidateUserCache(userId);
}

export async function updateArticleStatus(
  userId: number,
  articleId: number,
  updates: StatusUpdate,
  deps: Pick<
    ArticleServiceDeps,
    "getUserOwnedArticleByIdFn" | "upsertArticleStatusesFn"
  > = {},
) {
  const getOwned =
    deps.getUserOwnedArticleByIdFn ?? getUserOwnedArticleById;
  const upsert = deps.upsertArticleStatusesFn ?? upsertArticleStatuses;

  const db = getDb();
  const article = await getOwned(db, userId, articleId);
  if (!article) throw new ServerServiceError("Article not found", 404);

  await upsert(userId, [articleId], updates);
  invalidateUserCache(userId);
}
