/**
 * Server-side account operations shared across API surfaces.
 *
 * Transport-agnostic: accepts typed params, returns data or throws
 * {@link ServiceError}.
 */
import { eq } from "drizzle-orm";

import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import {
  articles,
  articleStatuses,
  categoryOrders,
  feedCategories,
  feeds,
  feedSources,
  sessions,
  users,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getUrlCredentials } from "@/lib/utils/url";

import { ServiceError } from "./errors";

export interface AccountServiceDeps {
  getDbFn?: () => unknown;
}

export async function deleteAccount(userId: number) {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    throw new ServiceError(
      "Account deletion is unavailable in preview mode",
      503,
    );
  }

  const db = getDb();
  const deletedUsers = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (deletedUsers.length === 0) {
    throw new ServiceError("Account not found", 404);
  }

  logger.warn("User deleted account", { userId });
}

export async function exportAccountData(
  userId: number,
  deps: AccountServiceDeps = {},
) {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    throw new ServiceError(
      "Data export is unavailable in preview mode",
      503,
    );
  }

  const db = (deps.getDbFn?.() ?? getDb()) as Pick<
    ReturnType<typeof getDb>,
    "select"
  >;

  const [userRows, sourceRows, sessionRows, categoryOrderRows, statusRows] =
    await Promise.all([
      db
        .select({
          allowInsecureTls: users.allowInsecureTls,
          createdAt: users.createdAt,
          email: users.email,
          lastForceRefreshedAt: users.lastForceRefreshedAt,
          proxyPassword: users.proxyPassword,
          proxyUrl: users.proxyUrl,
          proxyUsername: users.proxyUsername,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      db
        .select({
          enabled: feedSources.enabled,
          extractionDisabled: feedSources.extractionDisabled,
          id: feedSources.id,
          name: feedSources.name,
          proxyEnabled: feedSources.proxyEnabled,
          url: feedSources.url,
        })
        .from(feedSources)
        .where(eq(feedSources.userId, userId)),
      db
        .select({
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
          id: sessions.id,
        })
        .from(sessions)
        .where(eq(sessions.userId, userId)),
      db
        .select({
          orderedLabels: categoryOrders.orderedLabels,
          updatedAt: categoryOrders.updatedAt,
        })
        .from(categoryOrders)
        .where(eq(categoryOrders.userId, userId))
        .limit(1),
      db
        .select({
          articleId: articleStatuses.articleId,
          isRead: articleStatuses.isRead,
          isStarred: articleStatuses.isStarred,
          updatedAt: articleStatuses.updatedAt,
        })
        .from(articleStatuses)
        .where(eq(articleStatuses.userId, userId)),
    ]);

  const feedSourceIds = sourceRows.map((source) => source.id);
  const [categoryRows, articleRows] = await Promise.all([
    feedSourceIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            category: feedCategories.category,
            feedId: feedCategories.feedId,
          })
          .from(feedCategories)
          .where(eq(feedCategories.userId, userId)),
    feedSourceIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            articleId: articleStatuses.articleId,
            articleLink: articles.link,
            articleTitle: articles.title,
            feedUrl: feeds.url,
          })
          .from(articleStatuses)
          .innerJoin(articles, eq(articles.id, articleStatuses.articleId))
          .innerJoin(feeds, eq(feeds.id, articles.feedId))
          .where(eq(articleStatuses.userId, userId)),
  ]);

  const user = userRows.at(0);
  if (!user) throw new ServiceError("Account not found", 404);

  const embeddedProxyCredentials = user.proxyUrl
    ? getUrlCredentials(user.proxyUrl)
    : null;

  logger.info("User exported account data", { userId });

  return {
    articleStatus: statusRows,
    articleStatusContext: articleRows,
    categories: categoryRows,
    categoryOrder: categoryOrderRows[0] ?? null,
    exportedAt: new Date().toISOString(),
    feedSources: sourceRows,
    sessions: sessionRows,
    user: {
      allowInsecureTls: user.allowInsecureTls,
      createdAt: user.createdAt,
      email: user.email,
      hasProxyPassword:
        user.proxyPassword !== null ||
        embeddedProxyCredentials?.password !== null,
      lastForceRefreshedAt: user.lastForceRefreshedAt,
      proxyUrl: embeddedProxyCredentials?.sanitizedUrl ?? user.proxyUrl,
      proxyUsername:
        user.proxyUsername ?? embeddedProxyCredentials?.username ?? null,
      userId,
    },
  };
}
