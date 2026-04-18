import { NextRequest, NextResponse } from "next/server";

import {
  asTrimmedString,
  jsonError,
  parseJsonObjectBodyOrResponse,
  parsePositiveInt,
} from "@/lib/api/http";
import { isAllowedFeedUrl } from "@/lib/core";
import { getDb } from "@/lib/db";
import {
  createArticle,
  type CreateArticleParams,
  listUserArticles,
  serverApi,
} from "@/lib/server";
import { isValidUrl, parseDateOrNull } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface ArticlesRouteDeps {
  getDbFn?: typeof getDb;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  logAndRespondErrorFn?: typeof serverApi.logAndRespondError;
  requireAuthenticatedUserFn?: typeof serverApi.requireAuthenticatedUser;
  requireMutableAuthenticatedUserFn?: typeof serverApi.requireMutableAuthenticatedUser;
}

/**
 * Render the get component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered get component.
 */
export async function GET(
  request: NextRequest,
  depsOrContext: ArticlesRouteDeps | serverApi.RouteHandlerContext = {},
) {
  const deps =
    serverApi.resolveRouteHandlerDeps<ArticlesRouteDeps>(depsOrContext);
  const requireAuth =
    deps.requireAuthenticatedUserFn ?? serverApi.requireAuthenticatedUser;
  const respondError =
    deps.logAndRespondErrorFn ?? serverApi.logAndRespondError;

  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const articles = await listUserArticles(authResult.userId, {
      getDbFn: deps.getDbFn,
    });
    return NextResponse.json(articles);
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError)
      return jsonError(error.message, error.status);
    return respondError("Articles GET error", error);
  }
}

/**
 * Render the post component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered post component.
 */
export async function POST(
  request: NextRequest,
  depsOrContext: ArticlesRouteDeps | serverApi.RouteHandlerContext = {},
) {
  const deps =
    serverApi.resolveRouteHandlerDeps<ArticlesRouteDeps>(depsOrContext);
  const requireMutableAuth =
    deps.requireMutableAuthenticatedUserFn ??
    serverApi.requireMutableAuthenticatedUser;
  const respondError =
    deps.logAndRespondErrorFn ?? serverApi.logAndRespondError;

  try {
    const user = await requireMutableAuth(request);
    if (user instanceof Response) return user;

    const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (payloadOrResponse instanceof Response) return payloadOrResponse;

    const parsedPayload = parseCreateArticlePayload(payloadOrResponse);
    if (parsedPayload instanceof Response) return parsedPayload;

    const article = await createArticle(user.userId, parsedPayload, {
      getDbFn: deps.getDbFn,
      isAllowedFeedUrlFn: deps.isAllowedFeedUrlFn,
    });
    return NextResponse.json(article);
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError)
      return jsonError(error.message, error.status);
    return respondError("Articles POST error", error);
  }
}

/**
 * Parse the create article dates.
 * @param payload - The payload.
 * @returns The create article dates.
 */
function parseCreateArticleDates(
  payload: Record<string, unknown>,
): Response | { lastChecked: Date; publicationDate: Date } {
  const publicationDate = payload.publication_date
    ? parseDateOrNull(payload.publication_date)
    : new Date();
  const lastChecked = payload.last_checked
    ? parseDateOrNull(payload.last_checked)
    : new Date();

  if (!publicationDate || !lastChecked) {
    return jsonError(
      "publication_date and last_checked must be valid ISO dates",
      400,
    );
  }

  return { lastChecked, publicationDate };
}

/**
 * Parse the create article payload.
 * @param payload - The payload.
 * @returns The create article payload.
 */
function parseCreateArticlePayload(
  payload: Record<string, unknown>,
): CreateArticleParams | Response {
  const rawTitle = asTrimmedString(payload.title);
  const link = asTrimmedString(payload.link);
  const rawContent = typeof payload.content === "string" ? payload.content : "";
  const feedId = parsePositiveInt(payload.feed_id);

  if (!rawTitle) return jsonError("Title is required", 400);
  if (!link || !isValidUrl(link))
    return jsonError("A valid article link is required", 400);
  if (!feedId) return jsonError("A valid feed_id is required", 400);

  const parsedDates = parseCreateArticleDates(payload);
  if (parsedDates instanceof Response) return parsedDates;

  return {
    content: rawContent,
    feedId,
    lastChecked: parsedDates.lastChecked,
    link,
    publicationDate: parsedDates.publicationDate,
    title: rawTitle,
  };
}
