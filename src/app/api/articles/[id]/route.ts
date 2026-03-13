import { NextRequest, NextResponse } from "next/server";

import { jsonError, parsePositiveInt } from "@/lib/api/http";
import {
  getUserOwnedArticleById,
  withNormalizedArticleContent,
} from "@/lib/core/article-records";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { logAndRespondError, requireAuthenticatedUser } from "@/lib/server";

export const dynamic = "force-dynamic";

interface ArticleByIdRouteDeps {
  getDbFn?: typeof getDb;
  logAndRespondErrorFn?: typeof logAndRespondError;
  requireAuthenticatedUserFn?: typeof requireAuthenticatedUser;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

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
    if (RUNTIME_FLAGS.usePlaceholderData) {
      return jsonError("Article not found", 404);
    }

    const authResult = await requireAuth(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const { id } = await context.params;
    const articleId = parsePositiveInt(id);
    if (!articleId) {
      return jsonError("articleId must be a positive integer", 400);
    }

    const user = authResult;

    const db = getDbForRoute();
    const article = await getUserOwnedArticleById(db, user.userId, articleId);

    if (!article) {
      return jsonError("Article not found", 404);
    }

    return NextResponse.json(withNormalizedArticleContent(article));
  } catch (error) {
    return respondError("Article GET error", error);
  }
}
