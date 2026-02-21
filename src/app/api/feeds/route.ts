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

function isAllowedFeedUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:";
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
    const feedUrl = requestUrl.searchParams.get("url");

    if (feedUrl && !isAllowedFeedUrl(feedUrl)) {
      return NextResponse.json(
        { error: "Feed URL must use http or https" },
        { status: 400 },
      );
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      if (!feedUrl) {
        console.log("[feeds] placeholder: returning feed sources");
        return NextResponse.json(PLACEHOLDER_FEED_SOURCES);
      }

      const placeholderArticles = getPlaceholderArticlesForSource(feedUrl);
      console.log(
        `[feeds] placeholder: url=${feedUrl} count=${placeholderArticles.length}`,
      );
      return NextResponse.json(placeholderArticles);
    }

    const db = getDb();

    if (!feedUrl) {
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
        and(eq(feedSources.userId, user.userId), eq(feedSources.url, feedUrl)),
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
      .where(eq(feeds.url, feedUrl))
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
        .values({ url: feedUrl })
        .returning({
          id: feeds.id,
          url: feeds.url,
          lastFetched: feeds.lastFetched,
        });
      currentFeed = createdFeed;
    }

    if (shouldFetch) {
      const feedResponse = await axios.get(feedUrl);
      const feedResponseParsed = await parser.parseString(feedResponse.data);
      const now = new Date();

      const validItems = feedResponseParsed.items
        .filter((item) => Boolean(item.title) && Boolean(item.link))
        .map((item) => ({
          title: item.title!,
          link: item.link!,
          publicationDate: parseFeedItemDate(item.isoDate, now),
          content: item.content || "",
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
        .where(eq(feeds.url, feedUrl));
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
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      return NextResponse.json(
        {
          error:
            "Feed source management is disabled when SUPABASE_URL is not configured",
        },
        { status: 503 },
      );
    }

    const db = getDb();

    const body = await request.json();
    const name = body?.name?.trim();
    const url = body?.url?.trim();
    const category = body?.category?.trim() || "My Feeds";

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

    const [existingSource] = await db
      .select({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      })
      .from(feedSources)
      .where(and(eq(feedSources.userId, user.userId), eq(feedSources.url, url)))
      .limit(1);

    const [existingFeed] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.url, url))
      .limit(1);

    const sourceFeedId =
      existingFeed?.id ??
      (await db.insert(feeds).values({ url }).returning({ id: feeds.id }))[0]
        .id;

    await db
      .delete(feedCategories)
      .where(
        and(
          eq(feedCategories.userId, user.userId),
          eq(feedCategories.feedId, sourceFeedId),
        ),
      );

    await db.insert(feedCategories).values({
      userId: user.userId,
      feedId: sourceFeedId,
      category,
    });

    if (existingSource) {
      return NextResponse.json({ ...existingSource, category });
    }

    const [createdSource] = await db
      .insert(feedSources)
      .values({ userId: user.userId, name, url })
      .returning({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      });

    return NextResponse.json({ ...createdSource, category }, { status: 201 });
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
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      return NextResponse.json(
        {
          error:
            "Feed source management is disabled when SUPABASE_URL is not configured",
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
