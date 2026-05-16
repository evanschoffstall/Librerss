import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { jsonError, parsePositiveInt } from "@/lib/api/http";
import { getArticleById, serverApi } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Describes the article by ID route deps.
 */
interface ArticleByIdRouteDeps {
  logAndRespondErrorFn?: typeof serverApi.logAndRespondError;
  requireAuthenticatedUserFn?: typeof serverApi.requireAuthenticatedUser;
}

/**
 * Describes the route context.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Handle the GET request.
 * @param request - The request.
 * @param context - The context used to render the get component.
 * @param deps - The deps.
 * @returns A JSON response or error response.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
  deps: ArticleByIdRouteDeps = {},
) {
  try {
    const authResult = await (
      deps.requireAuthenticatedUserFn ?? serverApi.requireAuthenticatedUser
    )(request);
    if (authResult instanceof Response) return authResult;

    const { id } = await context.params;
    const articleId = parsePositiveInt(id);
    if (!articleId)
      return jsonError("articleId must be a positive integer", 400);

    const article = await getArticleById(authResult.userId, articleId);
    return NextResponse.json(article);
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError)
      return jsonError(error.message, error.status);
    return (deps.logAndRespondErrorFn ?? serverApi.logAndRespondError)(
      "Article GET error",
      error,
    );
  }
}
