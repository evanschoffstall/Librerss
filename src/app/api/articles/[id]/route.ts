import { NextRequest, NextResponse } from "next/server";

import { jsonError, parsePositiveInt } from "@/lib/api/http";
import { getArticleById, logAndRespondError, requireAuthenticatedUser, ServiceError } from "@/lib/server";

export const dynamic = "force-dynamic";

interface ArticleByIdRouteDeps {
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
  try {
    const authResult = await (deps.requireAuthenticatedUserFn ?? requireAuthenticatedUser)(request);
    if (authResult instanceof Response) return authResult;

    const { id } = await context.params;
    const articleId = parsePositiveInt(id);
    if (!articleId) return jsonError("articleId must be a positive integer", 400);

    const article = await getArticleById(authResult.userId, articleId);
    return NextResponse.json(article);
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return (deps.logAndRespondErrorFn ?? logAndRespondError)("Article GET error", error);
  }
}
