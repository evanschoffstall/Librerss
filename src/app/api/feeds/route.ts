import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import {
  FeedSourceNotFoundError,
  fetchAndCacheFeedArticles,
  isAllowedFeedUrl,
} from "@/lib/core/feedFetcher";
import {
  getPlaceholderArticlesForSource,
  PLACEHOLDER_FEED_SOURCES,
  RUNTIME_FLAGS,
} from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { feedCategories, feeds, feedSources } from "@/lib/db/schema";
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils/categories";
import { logger } from "@/lib/utils/logger";
import { rateLimiter } from "@/lib/utils/rate-limit";
import { normalizeFeedUrl, tryNormalizeFeedUrl } from "@/lib/utils/url";
import axios from "axios";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// DNS cache, URL validators, HTML sanitizer, RSS parser, and article-dedupe
// helpers have all moved to @/lib/core/feedFetcher.ts. This file contains
// only the Next.js route handlers.

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestUrl = new URL(request.url);
    const feedUrl = requestUrl.searchParams.get("url")?.trim();

    if (feedUrl && !(await isAllowedFeedUrl(feedUrl))) {
      return NextResponse.json(
        {
          error: "Feed URL must use http or https and resolve to a public host",
        },
        { status: 400 },
      );
    }

    const normalizedFeedUrl = feedUrl ? tryNormalizeFeedUrl(feedUrl) : null;

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

    const feedArticles = await fetchAndCacheFeedArticles(
      db,
      user.userId,
      normalizedFeedUrl,
    );
    return NextResponse.json(feedArticles);
  } catch (error) {
    if (error instanceof FeedSourceNotFoundError) {
      return NextResponse.json(
        { error: "Feed source not found" },
        { status: 404 },
      );
    }

    logger.error("Error fetching feed", {
      error: error instanceof Error ? error : new Error(String(error)),
    });

    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { error: "Unable to fetch upstream feed" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitError = rateLimiter.check(request, "feed-create", {
      windowMs: CONFIG.RATE_LIMIT_FEED_WINDOW_MS,
      maxAttempts: CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS,
    });
    if (rateLimitError) {
      return rateLimitError;
    }

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
        : DEFAULT_CATEGORY_LABEL;

    if (!name || !url) {
      return NextResponse.json(
        { error: "Both name and url are required" },
        { status: 400 },
      );
    }

    if (
      name.length > CONFIG.MAX_FEED_NAME_LENGTH ||
      category.length > CONFIG.MAX_CATEGORY_NAME_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `name and category must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less`,
        },
        { status: 400 },
      );
    }

    if (!(await isAllowedFeedUrl(url))) {
      return NextResponse.json(
        {
          error: "Feed URL must use http or https and resolve to a public host",
        },
        { status: 400 },
      );
    }

    const normalizedUrl = normalizeFeedUrl(url);

    // All reads and writes are inside one transaction so no concurrent request
    // can observe partial state (e.g. a Feed row created outside the tx that
    // a concurrent DELETE races against).
    const { sourceRecord, isNew } = await db.transaction(async (tx) => {
      // ── Check existing FeedSource ─────────────────────────────────────────
      const [existingSource] = await tx
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

      // ── Ensure a Feed row exists ──────────────────────────────────────────
      const [existingFeed] = await tx
        .select({ id: feeds.id })
        .from(feeds)
        .where(eq(feeds.url, normalizedUrl))
        .limit(1);

      let sourceFeedId = existingFeed?.id;

      if (!sourceFeedId) {
        const [createdFeed] = await tx
          .insert(feeds)
          .values({ url: normalizedUrl })
          .onConflictDoNothing({ target: feeds.url })
          .returning({ id: feeds.id });

        if (createdFeed) {
          sourceFeedId = createdFeed.id;
        } else {
          const [persistedFeed] = await tx
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

      // ── Update category assignment ────────────────────────────────────────
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

      // ── Update or create the FeedSource row ──────────────────────────────
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

        if (!updatedSource) {
          throw new Error("Failed to update feed source");
        }

        return { sourceRecord: updatedSource, isNew: false };
      }

      const [createdSource] = await tx
        .insert(feedSources)
        .values({ userId: user.userId, name, url: normalizedUrl })
        .returning({
          id: feedSources.id,
          name: feedSources.name,
          url: feedSources.url,
        });

      if (!createdSource) {
        throw new Error("Failed to create feed source");
      }

      return { sourceRecord: createdSource, isNew: true };
    });

    return NextResponse.json(
      { ...sourceRecord, category },
      { status: isNew ? 201 : 200 },
    );
  } catch (error) {
    logger.error("Error creating feed source", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const sourceId = Number(payload.id);
    const name = typeof payload.name === "string" ? payload.name.trim() : "";

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return NextResponse.json(
        { error: "A valid id is required" },
        { status: 400 },
      );
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (name.length > CONFIG.MAX_FEED_NAME_LENGTH) {
      return NextResponse.json(
        {
          error: `name must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less`,
        },
        { status: 400 },
      );
    }

    const db = getDb();

    const [updatedSource] = await db
      .update(feedSources)
      .set({ name })
      .where(
        and(eq(feedSources.id, sourceId), eq(feedSources.userId, user.userId)),
      )
      .returning({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      });

    if (!updatedSource) {
      return NextResponse.json(
        { error: "Feed source not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updatedSource);
  } catch (error) {
    logger.error("Error renaming feed source", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
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

    // Delete feedCategories and feedSources atomically so a crash between
    // the two statements cannot leave orphaned category rows.
    const [deletedSource] = await db.transaction(async (tx) => {
      if (feedForSource) {
        await tx
          .delete(feedCategories)
          .where(
            and(
              eq(feedCategories.userId, user.userId),
              eq(feedCategories.feedId, feedForSource.id),
            ),
          );
      }

      return tx
        .delete(feedSources)
        .where(
          and(
            eq(feedSources.id, sourceId),
            eq(feedSources.userId, user.userId),
          ),
        )
        .returning({
          id: feedSources.id,
          name: feedSources.name,
          url: feedSources.url,
        });
    });

    if (!deletedSource) {
      // Row was deleted by a concurrent request; treat as already gone.
      return NextResponse.json(
        { error: "Feed source not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(deletedSource);
  } catch (error) {
    logger.error("Error deleting feed source", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
