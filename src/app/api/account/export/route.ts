import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
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
import { requireMutableAuthenticatedUser } from "@/lib/server";
import { getUrlCredentials } from "@/lib/utils/url";

export const dynamic = "force-dynamic";

interface AccountExportRouteDeps {
  getDbFn?: () => unknown;
  infoFn?: typeof logger.info;
  requireAuthFn?: (
    request: NextRequest,
  ) => Promise<Response | { userId: number }>;
  runtimeFlags?: Pick<typeof RUNTIME_FLAGS, "usePlaceholderData">;
}

export async function GET(
  request: NextRequest,
  deps: AccountExportRouteDeps = {},
) {
  const requireAuth = deps.requireAuthFn ?? requireMutableAuthenticatedUser;
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  const runtimeFlags = deps.runtimeFlags ?? RUNTIME_FLAGS;
  if (runtimeFlags.usePlaceholderData) {
    return jsonError("Data export is unavailable in preview mode", 503);
  }

  const db = ((deps.getDbFn?.() ?? getDb()) as Pick<
    ReturnType<typeof getDb>,
    "select"
  >);

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
        .where(eq(users.id, authResult.userId))
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
        .where(eq(feedSources.userId, authResult.userId)),
      db
        .select({
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
          id: sessions.id,
        })
        .from(sessions)
        .where(eq(sessions.userId, authResult.userId)),
      db
        .select({
          orderedLabels: categoryOrders.orderedLabels,
          updatedAt: categoryOrders.updatedAt,
        })
        .from(categoryOrders)
        .where(eq(categoryOrders.userId, authResult.userId))
        .limit(1),
      db
        .select({
          articleId: articleStatuses.articleId,
          isRead: articleStatuses.isRead,
          isStarred: articleStatuses.isStarred,
          updatedAt: articleStatuses.updatedAt,
        })
        .from(articleStatuses)
        .where(eq(articleStatuses.userId, authResult.userId)),
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
          .where(eq(feedCategories.userId, authResult.userId)),
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
          .where(eq(articleStatuses.userId, authResult.userId)),
  ]);

  const user = userRows.at(0);
  if (!user) {
    return jsonError("Account not found", 404);
  }

  const embeddedProxyCredentials = user.proxyUrl
    ? getUrlCredentials(user.proxyUrl)
    : null;

  const payload = {
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
        user.proxyPassword !== null || embeddedProxyCredentials?.password !== null,
      lastForceRefreshedAt: user.lastForceRefreshedAt,
      proxyUrl: embeddedProxyCredentials?.sanitizedUrl ?? user.proxyUrl,
      proxyUsername:
        user.proxyUsername ?? embeddedProxyCredentials?.username ?? null,
      userId: authResult.userId,
    },
  };

  (deps.infoFn ?? logger.info)("User exported account data", {
    userId: authResult.userId,
  });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "cache-control": "no-store",
      "content-disposition":
        'attachment; filename="librerss-account-export.json"',
      "content-type": "application/json; charset=utf-8",
    },
    status: 200,
  });
}
