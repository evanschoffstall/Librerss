import {
  asTrimmedString,
  parseDateInput,
  parseJsonBodyOrResponse,
  parsePositiveInt,
} from "@/lib/api/request";
import {
  jsonError,
  logAndRespondError,
  requireAuthenticatedUser,
  requireMutableAuthenticatedUser,
} from "@/lib/api/route-helpers";
import { CONFIG } from "@/lib/config";
import { isAllowedFeedUrl } from "@/lib/core/feed-fetcher";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { articles, feeds, feedSources } from "@/lib/db/schema";
import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
  stripOrphanedRelatedBlocks,
} from "@/lib/utils/sanitize";
import { isValidUrl } from "@/lib/utils/url";
import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof Response) {
      return authResult;
    }
    const user = authResult;

    if (RUNTIME_FLAGS.usePlaceholderData) {
      // In placeholder mode there is no database, so return an empty list
      // instead of throwing on the missing DATABASE_URL.
      return NextResponse.json([]);
    }

    const db = getDb();

    // Single JOIN replaces the previous 3 sequential queries.
    const userArticles = await db
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
      .orderBy(desc(articles.publicationDate))
      .limit(CONFIG.MAX_ALL_ARTICLES_LIMIT);

    return NextResponse.json(
      userArticles.map((a) => ({
        ...a,
        content: a.content ? stripOrphanedRelatedBlocks(a.content) : a.content,
      })),
    );
  } catch (error) {
    return logAndRespondError("Articles GET error", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutableAuthenticatedUser(request);
    if (user instanceof Response) {
      return user;
    }

    const payloadOrResponse =
      await parseJsonBodyOrResponse<Record<string, unknown>>(request);
    if (payloadOrResponse instanceof Response) {
      return payloadOrResponse;
    }

    const parsedPayload = parseCreateArticlePayload(payloadOrResponse);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }
    const payload = parsedPayload;

    // SSRF guard — reject links that resolve to private/internal addresses.
    if (!(await isAllowedFeedUrl(payload.link))) {
      return jsonError("Article link must resolve to a public host", 400);
    }

    // Sanitize at write time — defence in depth against XSS.
    // sanitizeAndTruncateArticleContent strips unsafe HTML, enforces the length
    // cap, then re-sanitizes to close any tags broken by truncation.
    const title = sanitizeArticleTitle(payload.rawTitle);
    const content = sanitizeAndTruncateArticleContent(payload.rawContent);

    const db = getDb();

    const [ownedFeed] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .innerJoin(
        feedSources,
        and(
          eq(feedSources.url, feeds.url),
          eq(feedSources.userId, user.userId),
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
    return logAndRespondError("Articles POST error", error);
  }
}
