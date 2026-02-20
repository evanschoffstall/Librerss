import { db } from "@/src/lib/db/db";
import {
  articles,
  feedCategories,
  feeds,
  feedSources,
} from "@/src/lib/db/schema";
import axios from "axios";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";

/** Only allow http/https feed URLs to prevent SSRF against internal services. */
function isAllowedFeedUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const parser = new Parser();

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const feedUrl = url.searchParams.get("url");

    if (feedUrl && !isAllowedFeedUrl(feedUrl)) {
      return NextResponse.json(
        { error: "Feed URL must use http or https" },
        { status: 400 },
      );
    }

    if (!feedUrl) {
      const sourcesSelection = {
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
        category: feedCategories.category,
      };

      const sources = await db
        .select(sourcesSelection)
        .from(feedSources)
        .leftJoin(feeds, eq(feeds.url, feedSources.url))
        .leftJoin(feedCategories, eq(feedCategories.feedId, feeds.id))
        .orderBy(feedSources.name);

      return NextResponse.json(sources);
    }

    const existingFeed = await db
      .select()
      .from(feeds)
      .where(eq(feeds.url, feedUrl))
      .limit(1);

    let currentFeed = existingFeed[0];

    let shouldFetch = true;
    if (currentFeed) {
      const lastFetched = currentFeed.lastFetched;
      const diffMinutes =
        (new Date().getTime() - new Date(lastFetched).getTime()) / 60000;
      if (diffMinutes < 15) {
        shouldFetch = false;
      }
    } else {
      const [createdFeed] = await db
        .insert(feeds)
        .values({ url: feedUrl })
        .returning();
      currentFeed = createdFeed;
    }

    if (shouldFetch) {
      const feedResponse = await axios.get(feedUrl);
      const feedResponseParsed = await parser.parseString(feedResponse.data);

      const now = new Date();
      const validItems = feedResponseParsed.items
        .filter((item) => Boolean(item.title) && Boolean(item.link) && currentFeed)
        .map((item) => ({
          title: item.title!,
          link: item.link!,
          publicationDate: item.isoDate ? new Date(item.isoDate) : now,
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
              title: articles.title,
              publicationDate: articles.publicationDate,
              content: articles.content,
              lastChecked: articles.lastChecked,
            },
          });
      }

      await db
        .update(feeds)
        .set({ lastFetched: now })
        .where(eq(feeds.url, feedUrl));
    }

    if (currentFeed) {
      const feedArticles = await db
        .select({
          title: articles.title,
          link: articles.link,
          content: articles.content,
        })
        .from(articles)
        .where(eq(articles.feedId, currentFeed.id))
        .orderBy(desc(articles.publicationDate));

      return NextResponse.json(feedArticles);
    } else {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }
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

    const existingSource = await db
      .select({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      })
      .from(feedSources)
      .where(eq(feedSources.url, url))
      .limit(1);

    let sourceFeedId: number;
    const existingFeed = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.url, url))
      .limit(1);

    if (!existingFeed[0]) {
      const [createdFeed] = await db
        .insert(feeds)
        .values({ url })
        .returning({ id: feeds.id });
      sourceFeedId = createdFeed.id;
    } else {
      sourceFeedId = existingFeed[0].id;
    }

    await db
      .delete(feedCategories)
      .where(eq(feedCategories.feedId, sourceFeedId));
    await db.insert(feedCategories).values({
      feedId: sourceFeedId,
      category,
    });

    if (existingSource[0]) {
      return NextResponse.json({ ...existingSource[0], category });
    }

    const [createdSource] = await db
      .insert(feedSources)
      .values({ name, url })
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
    const url = new URL(request.url);
    const sourceId = Number(url.searchParams.get("id"));

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
      .where(eq(feedSources.id, sourceId))
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
        .where(eq(feedCategories.feedId, feedForSource.id));
    }

    const [deletedSource] = await db
      .delete(feedSources)
      .where(eq(feedSources.id, sourceId))
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
