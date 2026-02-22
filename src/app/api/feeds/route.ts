import { DEFAULT_CATEGORY_LABEL } from "@/lib";
import {
  asTrimmedString,
  parseJsonBody,
  parsePositiveInt,
} from "@/lib/api/request";
import {
  jsonError,
  logAndRespondError,
  requireAuthenticatedUser,
} from "@/lib/api/route-helpers";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { CONFIG } from "@/lib/config";
import {
  FeedSourceNotFoundError,
  fetchAndCacheFeedArticles,
  isAllowedFeedUrl,
} from "@/lib/core/feedFetcher";
import {
  getPlaceholderArticlesForSource,
  PLACEHOLDER_FEED_SOURCES,
} from "@/lib/core/placeholder";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { feedCategories, feeds, feedSources } from "@/lib/db/schema";
import { rateLimiter } from "@/lib/utils/rate-limit";
import { normalizeFeedUrl, tryNormalizeFeedUrl } from "@/lib/utils/url";
import axios from "axios";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// DNS cache, URL validators, HTML sanitizer, RSS parser, and article-dedupe
// helpers have all moved to @/lib/core/feedFetcher.ts. This file contains
// only the Next.js route handlers.

type FeedTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];
type AuthenticatedUser = Exclude<
  Awaited<ReturnType<typeof requireAuthenticatedUser>>,
  Response
>;

type CreateFeedPayload = {
  name: string;
  url: string;
  category: string;
};

type FeedSourceRecord = {
  id: number;
  name: string;
  url: string;
};

type CreateFeedSourceResult = {
  sourceRecord: FeedSourceRecord;
  isNew: boolean;
};

type RenameFeedPayload = {
  sourceId: number;
  name: string;
};

const PUBLIC_FEED_URL_ERROR =
  "Feed URL must use http or https and resolve to a public host";
const FEED_MANAGEMENT_DISABLED_ERROR =
  "Feed source management is disabled when DATABASE_URL is not configured";

async function getAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | Response> {
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  return authResult;
}

async function requireMutableFeedAccess(
  request: NextRequest,
  options?: {
    rateLimitKey?: string;
    windowMs?: number;
    maxAttempts?: number;
  },
): Promise<AuthenticatedUser | Response> {
  if (options?.rateLimitKey) {
    const rateLimitError = rateLimiter.check(request, options.rateLimitKey, {
      windowMs: options.windowMs ?? CONFIG.RATE_LIMIT_FEED_WINDOW_MS,
      maxAttempts: options.maxAttempts ?? CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS,
    });

    if (rateLimitError) {
      return rateLimitError;
    }
  }

  const csrfError = requireSameOrigin(request);
  if (csrfError) {
    return csrfError;
  }

  const user = await getAuthenticatedUser(request);
  if (user instanceof Response) {
    return user;
  }

  const feedManagementDisabledResponse = ensureFeedManagementEnabled();
  if (feedManagementDisabledResponse) {
    return feedManagementDisabledResponse;
  }

  return user;
}

function ensureFeedManagementEnabled(): Response | null {
  if (!RUNTIME_FLAGS.usePlaceholderData) {
    return null;
  }

  return jsonError(FEED_MANAGEMENT_DISABLED_ERROR, 503);
}

async function assertAllowedFeedUrl(url: string): Promise<Response | null> {
  if (await isAllowedFeedUrl(url)) {
    return null;
  }

  return jsonError(PUBLIC_FEED_URL_ERROR, 400);
}

async function parseCreateFeedPayload(
  request: NextRequest,
): Promise<CreateFeedPayload | Response> {
  const parsedBody = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const payload = parsedBody.data;
  const name = asTrimmedString(payload.name);
  const url = asTrimmedString(payload.url);
  const category =
    typeof payload.category === "string" && payload.category.trim()
      ? payload.category.trim()
      : DEFAULT_CATEGORY_LABEL;

  if (!name || !url) {
    return jsonError("Both name and url are required", 400);
  }

  if (
    name.length > CONFIG.MAX_FEED_NAME_LENGTH ||
    category.length > CONFIG.MAX_CATEGORY_NAME_LENGTH
  ) {
    return jsonError(
      `name and category must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less`,
      400,
    );
  }

  return { name, url, category };
}

async function parseRenameFeedPayload(
  request: NextRequest,
): Promise<RenameFeedPayload | Response> {
  const parsedBody = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const payload = parsedBody.data;
  const sourceId = parsePositiveInt(payload.id);
  const name = asTrimmedString(payload.name);

  if (!sourceId) {
    return jsonError("A valid id is required", 400);
  }

  if (!name) {
    return jsonError("name is required", 400);
  }

  if (name.length > CONFIG.MAX_FEED_NAME_LENGTH) {
    return jsonError(
      `name must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less`,
      400,
    );
  }

  return { sourceId, name };
}

function parseDeleteSourceId(request: NextRequest): number | Response {
  const requestUrl = new URL(request.url);
  const sourceId = parsePositiveInt(requestUrl.searchParams.get("id"));

  if (!sourceId) {
    return jsonError("A valid id query parameter is required", 400);
  }

  return sourceId;
}

async function resolveFeedId(
  tx: FeedTransaction,
  normalizedUrl: string,
): Promise<number> {
  const [existingFeed] = await tx
    .select({ id: feeds.id })
    .from(feeds)
    .where(eq(feeds.url, normalizedUrl))
    .limit(1);

  if (existingFeed?.id) {
    return existingFeed.id;
  }

  const [createdFeed] = await tx
    .insert(feeds)
    .values({ url: normalizedUrl })
    .onConflictDoNothing({ target: feeds.url })
    .returning({ id: feeds.id });

  if (createdFeed?.id) {
    return createdFeed.id;
  }

  const [persistedFeed] = await tx
    .select({ id: feeds.id })
    .from(feeds)
    .where(eq(feeds.url, normalizedUrl))
    .limit(1);

  if (!persistedFeed?.id) {
    throw new Error("Unable to resolve feed source id");
  }

  return persistedFeed.id;
}

async function upsertCategoryAssignment(
  tx: FeedTransaction,
  userId: number,
  feedId: number,
  category: string,
): Promise<void> {
  await tx
    .delete(feedCategories)
    .where(
      and(eq(feedCategories.userId, userId), eq(feedCategories.feedId, feedId)),
    );

  await tx.insert(feedCategories).values({
    userId,
    feedId,
    category,
  });
}

async function upsertFeedSource(
  tx: FeedTransaction,
  userId: number,
  name: string,
  normalizedUrl: string,
): Promise<CreateFeedSourceResult> {
  const [existingSource] = await tx
    .select({
      id: feedSources.id,
      name: feedSources.name,
      url: feedSources.url,
    })
    .from(feedSources)
    .where(
      and(eq(feedSources.userId, userId), eq(feedSources.url, normalizedUrl)),
    )
    .limit(1);

  if (existingSource) {
    const [updatedSource] = await tx
      .update(feedSources)
      .set({ name })
      .where(
        and(
          eq(feedSources.id, existingSource.id),
          eq(feedSources.userId, userId),
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
    .values({ userId, name, url: normalizedUrl })
    .returning({
      id: feedSources.id,
      name: feedSources.name,
      url: feedSources.url,
    });

  if (!createdSource) {
    throw new Error("Failed to create feed source");
  }

  return { sourceRecord: createdSource, isNew: true };
}

async function createOrUpdateFeedSource(
  tx: FeedTransaction,
  userId: number,
  payload: CreateFeedPayload,
): Promise<CreateFeedSourceResult> {
  const normalizedUrl = normalizeFeedUrl(payload.url);
  const sourceFeedId = await resolveFeedId(tx, normalizedUrl);

  await upsertCategoryAssignment(tx, userId, sourceFeedId, payload.category);
  return upsertFeedSource(tx, userId, payload.name, normalizedUrl);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (user instanceof Response) {
      return user;
    }

    const requestUrl = new URL(request.url);
    const feedUrl = requestUrl.searchParams.get("url")?.trim();

    if (feedUrl) {
      const invalidFeedUrlResponse = await assertAllowedFeedUrl(feedUrl);
      if (invalidFeedUrlResponse) {
        return invalidFeedUrlResponse;
      }
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
      return jsonError("Feed source not found", 404);
    }

    if (axios.isAxiosError(error)) {
      return logAndRespondError("Error fetching feed", error, {
        status: 502,
        publicMessage: "Unable to fetch upstream feed",
      });
    }

    return logAndRespondError("Error fetching feed", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutableFeedAccess(request, {
      rateLimitKey: "feed-create",
      windowMs: CONFIG.RATE_LIMIT_FEED_WINDOW_MS,
      maxAttempts: CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS,
    });
    if (user instanceof Response) {
      return user;
    }

    const parsedPayload = await parseCreateFeedPayload(request);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }

    const payload = parsedPayload;

    const invalidFeedUrlResponse = await assertAllowedFeedUrl(payload.url);
    if (invalidFeedUrlResponse) {
      return invalidFeedUrlResponse;
    }

    const db = getDb();

    const { sourceRecord, isNew } = await db.transaction(async (tx) => {
      return createOrUpdateFeedSource(tx, user.userId, payload);
    });

    return NextResponse.json(
      { ...sourceRecord, category: payload.category },
      { status: isNew ? 201 : 200 },
    );
  } catch (error) {
    return logAndRespondError("Error creating feed source", error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireMutableFeedAccess(request);
    if (user instanceof Response) {
      return user;
    }

    const parsedPayload = await parseRenameFeedPayload(request);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }

    const { sourceId, name } = parsedPayload;

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
      return jsonError("Feed source not found", 404);
    }

    return NextResponse.json(updatedSource);
  } catch (error) {
    return logAndRespondError("Error renaming feed source", error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireMutableFeedAccess(request);
    if (user instanceof Response) {
      return user;
    }

    const sourceId = parseDeleteSourceId(request);
    if (sourceId instanceof Response) {
      return sourceId;
    }

    const db = getDb();

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
      return jsonError("Feed source not found", 404);
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
      return jsonError("Feed source not found", 404);
    }

    return NextResponse.json(deletedSource);
  } catch (error) {
    return logAndRespondError("Error deleting feed source", error);
  }
}
