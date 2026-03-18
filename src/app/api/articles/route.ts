import { NextRequest, NextResponse } from "next/server";

import {
  asTrimmedString,
  jsonError,
  parseJsonObjectBodyOrResponse,
  parsePositiveInt,
} from "@/lib/api/http";
import { isAllowedFeedUrl } from "@/lib/core/feed-url-validator";
import { getDb } from "@/lib/db/db";
import {
  logAndRespondError,
  requireAuthenticatedUser,
  requireMutableAuthenticatedUser,
} from "@/lib/server";
import {
  createArticle,
  type CreateArticleParams,
  listUserArticles,
  ServiceError,
} from "@/lib/server/services";
import { parseDateOrNull } from "@/lib/utils/dates";
import { isValidUrl } from "@/lib/utils/url";

export const dynamic = "force-dynamic";

interface ArticlesRouteDeps {
  getDbFn?: typeof getDb;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  logAndRespondErrorFn?: typeof logAndRespondError;
  requireAuthenticatedUserFn?: typeof requireAuthenticatedUser;
  requireMutableAuthenticatedUserFn?: typeof requireMutableAuthenticatedUser;
}

export async function GET(request: NextRequest, deps: ArticlesRouteDeps = {}) {
  const requireAuth =
    deps.requireAuthenticatedUserFn ?? requireAuthenticatedUser;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const articles = await listUserArticles(authResult.userId, {
      getDbFn: deps.getDbFn,
    });
    return NextResponse.json(articles);
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return respondError("Articles GET error", error);
  }
}

export async function POST(request: NextRequest, deps: ArticlesRouteDeps = {}) {
  const requireMutableAuth =
    deps.requireMutableAuthenticatedUserFn ?? requireMutableAuthenticatedUser;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

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
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return respondError("Articles POST error", error);
  }
}

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

function parseCreateArticlePayload(
  payload: Record<string, unknown>,
): CreateArticleParams | Response {
  const rawTitle = asTrimmedString(payload.title);
  const link = asTrimmedString(payload.link);
  const rawContent = typeof payload.content === "string" ? payload.content : "";
  const feedId = parsePositiveInt(payload.feed_id);

  if (!rawTitle) return jsonError("Title is required", 400);
  if (!link || !isValidUrl(link)) return jsonError("A valid article link is required", 400);
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
