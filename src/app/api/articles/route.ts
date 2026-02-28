import {
  asTrimmedString,
  jsonError,
  parseDateInput,
  parseJsonObjectBodyOrResponse,
  parsePositiveInt,
} from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import {
  listUserOwnedArticles,
  withNormalizedArticleContent,
} from "@/lib/core/article-records";
import { isAllowedFeedUrl } from "@/lib/core/feed-url-validator";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { articles, feeds, feedSources } from "@/lib/db/schema";
import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
} from "@/lib/sanitize";
import {
  logAndRespondError,
  requireAuthenticatedUser,
  requireMutableAuthenticatedUser,
} from "@/lib/server";
import { isValidUrl } from "@/lib/utils/url";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ArticlesRouteDeps = {
  requireAuthenticatedUserFn?: typeof requireAuthenticatedUser;
  requireMutableAuthenticatedUserFn?: typeof requireMutableAuthenticatedUser;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  getDbFn?: typeof getDb;
  logAndRespondErrorFn?: typeof logAndRespondError;
};

type CreateArticlePayload = {
  rawTitle: string;
  link: string;
  rawContent: string;
  feedId: number;
  publicationDate: Date;
  lastChecked: Date;
};

function parseCreateArticleDates(
  payload: Record<string, unknown>,
): { publicationDate: Date; lastChecked: Date } | Response {
  const publicationDate = payload.publication_date
    ? parseDateInput(payload.publication_date)
    : new Date();
  const lastChecked = payload.last_checked
    ? parseDateInput(payload.last_checked)
    : new Date();

  if (!publicationDate || !lastChecked) {
    return jsonError(
      "publication_date and last_checked must be valid ISO dates",
      400,
    );
  }

  return { publicationDate, lastChecked };
}

function parseCreateArticlePayload(
  payload: Record<string, unknown>,
): CreateArticlePayload | Response {
  const rawTitle = asTrimmedString(payload.title);
  const link = asTrimmedString(payload.link);
  const rawContent = typeof payload.content === "string" ? payload.content : "";
  const feedId = parsePositiveInt(payload.feed_id);

  if (!rawTitle) {
    return jsonError("Title is required", 400);
  }

  if (!link || !isValidUrl(link)) {
    return jsonError("A valid article link is required", 400);
  }

  if (!feedId) {
    return jsonError("A valid feed_id is required", 400);
  }

  const parsedDates = parseCreateArticleDates(payload);
  if (parsedDates instanceof Response) {
    return parsedDates;
  }

  return {
    rawTitle,
    link,
    rawContent,
    feedId,
    publicationDate: parsedDates.publicationDate,
    lastChecked: parsedDates.lastChecked,
  };
}

export async function GET(request: NextRequest, deps: ArticlesRouteDeps = {}) {
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

    if (RUNTIME_FLAGS.usePlaceholderData) {
      // In placeholder mode there is no database, so return an empty list
      // instead of throwing on the missing DATABASE_URL.
      return NextResponse.json([]);
    }

    const db = getDbForRoute();
    const userArticles = await listUserOwnedArticles(
      db,
      user.userId,
      CONFIG.MAX_ALL_ARTICLES_LIMIT,
    );

    return NextResponse.json(userArticles.map(withNormalizedArticleContent));
  } catch (error) {
    return respondError("Articles GET error", error);
  }
}

export async function POST(request: NextRequest, deps: ArticlesRouteDeps = {}) {
  const requireMutableAuth =
    deps.requireMutableAuthenticatedUserFn ?? requireMutableAuthenticatedUser;
  const isAllowedFeedUrlForRoute = deps.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  const getDbForRoute = deps.getDbFn ?? getDb;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutableAuth(request);
    if (user instanceof Response) {
      return user;
    }

    const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (payloadOrResponse instanceof Response) {
      return payloadOrResponse;
    }

    const parsedPayload = parseCreateArticlePayload(payloadOrResponse);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }
    const payload = parsedPayload;

    // SSRF guard — reject links that resolve to private/internal addresses.
    if (!(await isAllowedFeedUrlForRoute(payload.link))) {
      return jsonError("Article link must resolve to a public host", 400);
    }

    // Sanitize at write time — defence in depth against XSS.
    // sanitizeAndTruncateArticleContent strips unsafe HTML, enforces the length
    // cap, then re-sanitizes to close any tags broken by truncation.
    const title = sanitizeArticleTitle(payload.rawTitle);
    const content = sanitizeAndTruncateArticleContent(payload.rawContent);

    const db = getDbForRoute();

    const [ownedFeed] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .innerJoin(
        feedSources,
        and(
          eq(feedSources.url, feeds.url),
          eq(feedSources.userId, user.userId),
          eq(feedSources.enabled, true),
        ),
      )
      .where(eq(feeds.id, payload.feedId))
      .limit(1);

    if (!ownedFeed) {
      return jsonError("Feed not found for authenticated user", 403);
    }

    const [newArticle] = await db
      .insert(articles)
      .values({
        title,
        link: payload.link,
        publicationDate: payload.publicationDate,
        content,
        feedId: payload.feedId,
        lastChecked: payload.lastChecked,
      })
      .returning();

    return NextResponse.json(newArticle);
  } catch (error) {
    return respondError("Articles POST error", error);
  }
}
