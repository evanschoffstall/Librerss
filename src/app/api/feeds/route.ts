import { requireSameOrigin } from "@/src/lib/auth/csrf";
import { getUserFromRequest } from "@/src/lib/auth/session";
import {
  getPlaceholderArticlesForSource,
  PLACEHOLDER_FEED_SOURCES,
  RUNTIME_FLAGS,
} from "@/src/lib/core/runtime";
import { getDb } from "@/src/lib/db/db";
import {
  articles,
  feedCategories,
  feeds,
  feedSources,
} from "@/src/lib/db/schema";
import axios from "axios";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/i,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
];

function normalizeFeedUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString().replace(/\/+$/, "");
}

function isBlockedFeedHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized.endsWith(".local") ||
    BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function isAllowedFeedUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const hasSupportedProtocol =
      parsed.protocol === "http:" || parsed.protocol === "https:";

    if (!hasSupportedProtocol) {
      return false;
    }

    if (parsed.username || parsed.password) {
      return false;
    }

    return !isBlockedFeedHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isAllowedArticleLink(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const parser = new Parser();

function parseFeedItemDate(value: string | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestUrl = new URL(request.url);
    const feedUrl = requestUrl.searchParams.get("url")?.trim();

    if (feedUrl && !isAllowedFeedUrl(feedUrl)) {
      return NextResponse.json(
        { error: "Feed URL must use http or https" },
        { status: 400 },
      );
    }

    const normalizedFeedUrl = feedUrl ? normalizeFeedUrl(feedUrl) : null;

    if (RUNTIME_FLAGS.usePlaceholderData) {
      if (!normalizedFeedUrl) {
        return NextResponse.json(PLACEHOLDER_FEED_SOURCES);
      }

      return NextResponse.json(
        getPlaceholderArticlesForSource(normalizedFeedUrl),
      );
    }

    const db = getDb();

    if (!normalizedFeedUrl) {
      const sources = await db
        .select({
          id: feedSources.id,
          name: feedSources.name,
          url: feedSources.url,
          category: feedCategories.category,
        })
        .from(feedSources)
        .leftJoin(feeds, eq(feeds.url, feedSources.url))
        .leftJoin(
          feedCategories,
          and(
            eq(feedCategories.feedId, feeds.id),
            eq(feedCategories.userId, user.userId),
          ),
        )
        .where(eq(feedSources.userId, user.userId))
        .orderBy(feedSources.name);

      return NextResponse.json(sources);
    }

    const [userSource] = await db
      .select({ id: feedSources.id })
      .from(feedSources)
      .where(
        and(
          eq(feedSources.userId, user.userId),
          eq(feedSources.url, normalizedFeedUrl),
        ),
      )
      .limit(1);

    if (!userSource) {
      return NextResponse.json(
        { error: "Feed source not found" },
        { status: 404 },
      );
    }

    const [existingFeed] = await db
      .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
      .from(feeds)
      .where(eq(feeds.url, normalizedFeedUrl))
      .limit(1);

    let currentFeed = existingFeed;
    let shouldFetch = true;

    if (currentFeed) {
      const diffMinutes =
        (Date.now() - new Date(currentFeed.lastFetched).getTime()) / 60000;
      if (diffMinutes < 15) {
        shouldFetch = false;
      }
    } else {
      const [createdFeed] = await db
        .insert(feeds)
        .values({ url: normalizedFeedUrl })
        .onConflictDoNothing({ target: feeds.url })
        .returning({
          id: feeds.id,
          url: feeds.url,
          lastFetched: feeds.lastFetched,
        });

      if (createdFeed) {
        currentFeed = createdFeed;
      } else {
        const [persistedFeed] = await db
          .select({
            id: feeds.id,
            url: feeds.url,
            lastFetched: feeds.lastFetched,
          })
          .from(feeds)
          .where(eq(feeds.url, normalizedFeedUrl))
          .limit(1);
        currentFeed = persistedFeed;
      }
    }

    if (!currentFeed) {
      throw new Error("Unable to resolve feed record");
    }

    if (shouldFetch) {
      const feedResponse = await axios.get(normalizedFeedUrl, {
        timeout: 10000,
        maxContentLength: 5 * 1024 * 1024,
        maxRedirects: 3,
      });
      const feedResponseParsed = await parser.parseString(feedResponse.data);
      const now = new Date();

      const validItems = feedResponseParsed.items
        .filter(
          (item) =>
            Boolean(item.title) &&
            Boolean(item.link) &&
            isAllowedArticleLink(item.link ?? ""),
        )
        .map((item) => ({
          title: item.title!,
          link: item.link!,
          publicationDate: parseFeedItemDate(item.isoDate ?? item.pubDate, now),
          content: item.content || item.contentSnippet || "",
          feedId: currentFeed.id,
          lastChecked: now,
        }));

      if (validItems.length > 0) {
        await db
          .insert(articles)
          .values(validItems)
          .onConflictDoUpdate({
            target: articles.link,
            set: {
              title: sql`excluded.title`,
              publicationDate: sql`excluded.publication_date`,
              content: sql`excluded.content`,
              lastChecked: sql`excluded.last_checked`,
            },
          });
      }

      await db
        .update(feeds)
        .set({ lastFetched: now })
        .where(eq(feeds.url, normalizedFeedUrl));
    }

    const feedArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        link: articles.link,
        content: articles.content,
        publicationDate: articles.publicationDate,
        feedId: articles.feedId,
        lastChecked: articles.lastChecked,
      })
      .from(articles)
      .where(eq(articles.feedId, currentFeed.id))
      .orderBy(desc(articles.publicationDate));

    return NextResponse.json(feedArticles);
  } catch (error) {
    console.error("Error fetching feed:", error);
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

    if (RUNTIME_FLAGS.usePlaceholderData) {
      return NextResponse.json(
        {
          error:
            "Feed source management is disabled when DATABASE_URL is not configured",
        },
        { status: 503 },
      );
    }

    const db = getDb();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const url = typeof payload.url === "string" ? payload.url.trim() : "";
    const category =
      typeof payload.category === "string" && payload.category.trim()
        ? payload.category.trim()
        : "My Feeds";

    if (!name || !url) {
      return NextResponse.json(
        { error: "Both name and url are required" },
        { status: 400 },
      );
    }

    if (name.length > 255 || category.length > 255) {
      return NextResponse.json(
        { error: "name and category must be 255 characters or less" },
        { status: 400 },
      );
    }

    if (!isAllowedFeedUrl(url)) {
      return NextResponse.json(
        { error: "Feed URL must use http or https" },
        { status: 400 },
      );
    }

    const normalizedUrl = normalizeFeedUrl(url);

    const [existingSource] = await db
      .select({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      })
      .from(feedSources)
      .where(
        and(
          eq(feedSources.userId, user.userId),
          eq(feedSources.url, normalizedUrl),
        ),
      )
      .limit(1);

    const [existingFeed] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.url, normalizedUrl))
      .limit(1);

    let sourceFeedId = existingFeed?.id;

    if (!sourceFeedId) {
      const [createdFeed] = await db
        .insert(feeds)
        .values({ url: normalizedUrl })
        .onConflictDoNothing({ target: feeds.url })
        .returning({ id: feeds.id });

      if (createdFeed) {
        sourceFeedId = createdFeed.id;
      } else {
        const [persistedFeed] = await db
          .select({ id: feeds.id })
          .from(feeds)
          .where(eq(feeds.url, normalizedUrl))
          .limit(1);
        sourceFeedId = persistedFeed?.id;
      }
    }

    if (!sourceFeedId) {
      throw new Error("Unable to resolve feed source id");
    }

    const sourceRecord = await db.transaction(async (tx) => {
      await tx
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.userId, user.userId),
            eq(feedCategories.feedId, sourceFeedId),
          ),
        );

      await tx.insert(feedCategories).values({
        userId: user.userId,
        feedId: sourceFeedId,
        category,
      });

      if (existingSource) {
        const [updatedSource] = await tx
          .update(feedSources)
          .set({ name })
          .where(
            and(
              eq(feedSources.id, existingSource.id),
              eq(feedSources.userId, user.userId),
            ),
          )
          .returning({
            id: feedSources.id,
            name: feedSources.name,
            url: feedSources.url,
          });

        return updatedSource ?? existingSource;
      }

      const [createdSource] = await tx
        .insert(feedSources)
        .values({ userId: user.userId, name, url: normalizedUrl })
        .returning({
          id: feedSources.id,
          name: feedSources.name,
          url: feedSources.url,
        });

      return createdSource;
    });

    return NextResponse.json(
      { ...sourceRecord, category },
      { status: existingSource ? 200 : 201 },
    );
  } catch (error) {
    console.error("Error creating feed source:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      return NextResponse.json(
        {
          error:
            "Feed source management is disabled when DATABASE_URL is not configured",
        },
        { status: 503 },
      );
    }

    const db = getDb();

    const requestUrl = new URL(request.url);
    const sourceId = Number(requestUrl.searchParams.get("id"));

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return NextResponse.json(
        { error: "A valid id query parameter is required" },
        { status: 400 },
      );
    }

    const [sourceToDelete] = await db
      .select({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      })
      .from(feedSources)
      .where(
        and(eq(feedSources.id, sourceId), eq(feedSources.userId, user.userId)),
      )
      .limit(1);

    if (!sourceToDelete) {
      return NextResponse.json(
        { error: "Feed source not found" },
        { status: 404 },
      );
    }

    const [feedForSource] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.url, sourceToDelete.url))
      .limit(1);

    if (feedForSource) {
      await db
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.userId, user.userId),
            eq(feedCategories.feedId, feedForSource.id),
          ),
        );
    }

    const [deletedSource] = await db
      .delete(feedSources)
      .where(
        and(eq(feedSources.id, sourceId), eq(feedSources.userId, user.userId)),
      )
      .returning({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      });

    return NextResponse.json(deletedSource);
  } catch (error) {
    console.error("Error deleting feed source:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
