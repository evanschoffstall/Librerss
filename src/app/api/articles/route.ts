import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { isValidUrl } from "@/lib/core/utils";
import { getDb } from "@/lib/db/db";
import { articles, feeds, feedSources } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import {
  sanitizeArticleContent,
  sanitizeArticleTitle,
} from "@/lib/utils/validation";
import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";

// Allowed HTML for manually submitted article content (matches feedFetcher's
// sanitizeRssHtml config so the same content rules apply everywhere).
const ARTICLE_CONTENT_ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "a",
  "hr",
  "figure",
  "figcaption",
];

function sanitizePostContent(raw: string): string {
  return sanitizeHtml(raw.trim(), {
    allowedTags: ARTICLE_CONTENT_ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      code: ["class"],
      pre: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName: string, attribs: Record<string, string>) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
    },
  }).trim();
}

export const dynamic = "force-dynamic";

function parseDateInput(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      .limit(500);

    return NextResponse.json(userArticles);
  } catch (error) {
    logger.error("Articles GET error", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = data as Record<string, unknown>;
    const rawTitle =
      typeof payload.title === "string" ? payload.title.trim() : "";
    const link = typeof payload.link === "string" ? payload.link.trim() : "";
    const rawContent =
      typeof payload.content === "string" ? payload.content : "";
    const feedId = Number(payload.feed_id);

    if (!rawTitle) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!link || !isValidUrl(link)) {
      return NextResponse.json(
        { error: "A valid article link is required" },
        { status: 400 },
      );
    }

    if (!Number.isInteger(feedId) || feedId <= 0) {
      return NextResponse.json(
        { error: "A valid feed_id is required" },
        { status: 400 },
      );
    }

    const publicationDate = payload.publication_date
      ? parseDateInput(payload.publication_date)
      : new Date();
    const lastChecked = payload.last_checked
      ? parseDateInput(payload.last_checked)
      : new Date();

    if (!publicationDate || !lastChecked) {
      return NextResponse.json(
        { error: "publication_date and last_checked must be valid ISO dates" },
        { status: 400 },
      );
    }

    // Sanitize at write time — defence in depth against XSS.
    // sanitizePostContent strips unsafe HTML tags/attributes before storing;
    // sanitizeArticleContent enforces the length cap after HTML sanitization.
    const title = sanitizeArticleTitle(rawTitle);
    const content = sanitizeArticleContent(sanitizePostContent(rawContent));

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
      .where(eq(feeds.id, feedId))
      .limit(1);

    if (!ownedFeed) {
      return NextResponse.json(
        { error: "Feed not found for authenticated user" },
        { status: 403 },
      );
    }

    const [newArticle] = await db
      .insert(articles)
      .values({
        title,
        link,
        publicationDate,
        content,
        feedId,
        lastChecked,
      })
      .returning();

    return NextResponse.json(newArticle);
  } catch (error) {
    logger.error("Articles POST error", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
