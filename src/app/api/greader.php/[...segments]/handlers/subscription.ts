import { parseFormOrQueryParams, textResponse } from "@/lib/api/http";
import { type SessionUser } from "@/lib/auth/session";
import { isAllowedFeedUrl } from "@/lib/core/feed-url-validator";
import {
  FEED_STREAM_PREFIX,
  parseUserLabel,
  USER_LABEL_PREFIX,
} from "@/lib/core/stream-ids";
import { getDb } from "@/lib/db/db";
import {
  ensureFeedRecordByUrl,
  findFeedIdByUrl,
  removeUserFeedCategory,
  replaceUserFeedCategory,
} from "@/lib/db/feed-records";
import { feedSources } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getUrlHostnameLabel, tryNormalizeFeedUrl } from "@/lib/utils/url";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { withResolvedCategoryByUrl } from "../services/categories";
import { toReaderIconUrl } from "../services/mappers";
import { loadUserSubscriptionRows } from "../services/subscription-data";

export async function handleSubscriptionList(
  user: SessionUser,
): Promise<Response> {
  const rows = await loadUserSubscriptionRows(user.userId);

  const normalizedRows = await withResolvedCategoryByUrl(
    user.userId,
    rows,
    (row) => row.url,
  );

  logger.info("[greader] subscription/list", {
    userId: user.userId,
    subscriptionCount: rows.length,
  });

  return NextResponse.json({
    subscriptions: normalizedRows.map((row) => {
      const iconUrl = toReaderIconUrl(row.url);
      const categoryLabel = row.category?.trim() || null;
      return {
        id: `${FEED_STREAM_PREFIX}${row.url}`,
        title: row.title,
        url: row.url,
        htmlUrl: row.url,
        ...(iconUrl ? { iconUrl } : {}),
        sortid: String(row.sourceId),
        // Return an empty categories array for feeds with no resolved category
        // so NNW leaves them at the account top level rather than treating them
        // as belonging to "My Feeds" — which would cause an early return in
        // syncFeedFolderRelationship when "My Feeds" is absent from tag/list.
        categories: categoryLabel
          ? [
              {
                id: `${USER_LABEL_PREFIX}${categoryLabel}`,
                label: categoryLabel,
              },
            ]
          : [],
      };
    }),
  });
}

export async function handleSubscriptionQuickAdd(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  if (params instanceof Response) {
    return params;
  }
  const quickAdd = params.get("quickadd")?.trim() ?? "";

  const normalizedUrl = tryNormalizeFeedUrl(quickAdd);
  if (!normalizedUrl || !(await isAllowedFeedUrl(normalizedUrl))) {
    return NextResponse.json(
      { numResults: 0, error: "Invalid feed URL" },
      { status: 400 },
    );
  }

  const db = getDb();

  const [existing] = await db
    .select({ id: feedSources.id })
    .from(feedSources)
    .where(
      and(
        eq(feedSources.userId, user.userId),
        eq(feedSources.url, normalizedUrl),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({
      numResults: 0,
      error: `Already subscribed! ${normalizedUrl}`,
      streamId: `${FEED_STREAM_PREFIX}${normalizedUrl}`,
    });
  }

  const feedId = (await ensureFeedRecordByUrl(db, normalizedUrl)).id;

  if (!feedId) {
    return NextResponse.json(
      { numResults: 0, error: "Unable to create feed" },
      { status: 500 },
    );
  }

  const fallbackName = getUrlHostnameLabel(normalizedUrl, normalizedUrl);

  await db.insert(feedSources).values({
    userId: user.userId,
    url: normalizedUrl,
    name: fallbackName,
  });

  return NextResponse.json({
    numResults: 1,
    streamId: `${FEED_STREAM_PREFIX}${normalizedUrl}`,
  });
}

export async function handleSubscriptionEdit(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  if (params instanceof Response) {
    return params;
  }
  const subscriptionId = params.get("s")?.trim() ?? "";
  const action = params.get("ac")?.trim() ?? "";
  const title = params.get("t")?.trim() ?? "";
  const addTag = params.get("a")?.trim() ?? "";
  const removeTag = params.get("r")?.trim() ?? "";

  if (!subscriptionId.startsWith(FEED_STREAM_PREFIX)) {
    return textResponse("OK\n");
  }

  const feedUrl = subscriptionId.slice(FEED_STREAM_PREFIX.length);
  const db = getDb();

  if (action === "unsubscribe") {
    await db
      .delete(feedSources)
      .where(
        and(eq(feedSources.userId, user.userId), eq(feedSources.url, feedUrl)),
      );

    const feedId = await findFeedIdByUrl(db, feedUrl);

    if (feedId) {
      await removeUserFeedCategory(db, {
        userId: user.userId,
        feedId,
      });
    }

    return textResponse("OK\n");
  }

  if (title) {
    await db
      .update(feedSources)
      .set({ name: title })
      .where(
        and(eq(feedSources.userId, user.userId), eq(feedSources.url, feedUrl)),
      );
  }

  const hasTagChange =
    addTag.startsWith(USER_LABEL_PREFIX) ||
    removeTag.startsWith(USER_LABEL_PREFIX);

  if (hasTagChange) {
    const feedId = await findFeedIdByUrl(db, feedUrl);

    if (feedId) {
      const addLabel = parseUserLabel(addTag);
      if (addLabel) {
        await replaceUserFeedCategory(db, {
          userId: user.userId,
          feedId,
          category: addLabel,
        });
      }

      const removeLabel = parseUserLabel(removeTag);
      if (removeLabel) {
        await removeUserFeedCategory(db, {
          userId: user.userId,
          feedId,
          category: removeLabel,
        });
      }
    }
  }

  return textResponse("OK\n");
}
