import { parsePositiveInt } from "@/lib/api/request";
import {
  logAndRespondError,
  requireAuthenticatedUser,
} from "@/lib/api/request-guards";
import { jsonError } from "@/lib/api/responses";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { articles, feeds, feedSources } from "@/lib/db/schema";
import {
  normalizeArticleHtmlSpacing,
  stripOrphanedRelatedBlocks,
} from "@/lib/utils/sanitize";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type ArticleByIdRouteDeps = {
  requireAuthenticatedUserFn?: typeof requireAuthenticatedUser;
  getDbFn?: typeof getDb;
  logAndRespondErrorFn?: typeof logAndRespondError;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
  deps: ArticleByIdRouteDeps = {},
) {
  const requireAuth =
    deps.requireAuthenticatedUserFn ?? requireAuthenticatedUser;
  const getDbForRoute = deps.getDbFn ?? getDb;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) {
      return authResult;
    }
    const user = authResult;

    const { id } = await context.params;
    const articleId = parsePositiveInt(id);

    if (!articleId) {
      return jsonError("articleId must be a positive integer", 400);
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      return jsonError("Article not found", 404);
    }

    const db = getDbForRoute();

    // Join through feeds → feedSources to verify the requesting user owns
    // a subscription to the feed this article belongs to.
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        link: articles.link,
        content: articles.content,
        publicationDate: articles.publicationDate,
        lastChecked: articles.lastChecked,
        feedId: articles.feedId,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(
        feedSources,
        and(
          eq(feedSources.url, feeds.url),
          eq(feedSources.userId, user.userId),
        ),
      )
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      return jsonError("Article not found", 404);
    }

    return NextResponse.json({
      ...article,
      content: article.content
        ? normalizeArticleHtmlSpacing(
            stripOrphanedRelatedBlocks(article.content),
          )
        : article.content,
    });
  } catch (error) {
    return respondError("Article GET error", error);
  }
}
