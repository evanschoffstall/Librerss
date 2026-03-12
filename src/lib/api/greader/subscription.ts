import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { withResolvedCategoryByUrl } from "./categories";
import { toReaderIconUrl } from "./mappers";
import { loadUserSubscriptionRows } from "./subscription-data";

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
    await db.transaction(async (tx) => {
      await tx
        .delete(feedSources)
        .where(
          and(
            eq(feedSources.userId, user.userId),
            eq(feedSources.url, feedUrl),
          ),
        );

      const feedId = await findFeedIdByUrl(tx, feedUrl);
      if (feedId) {
        await removeUserFeedCategory(tx, { feedId, userId: user.userId });
      }
    });

    return textResponse("OK\n");
  }

  const hasTagChange =
    addTag.startsWith(USER_LABEL_PREFIX) ||
    removeTag.startsWith(USER_LABEL_PREFIX);

  await db.transaction(async (tx) => {
    if (title) {
      await tx
        .update(feedSources)
        .set({ name: title })
        .where(
          and(
            eq(feedSources.userId, user.userId),
            eq(feedSources.url, feedUrl),
          ),
        );
    }

    if (hasTagChange) {
      const feedId = await findFeedIdByUrl(tx, feedUrl);

      if (feedId) {
        const addLabel = parseUserLabel(addTag);
        if (addLabel) {
          await replaceUserFeedCategory(tx, {
            category: addLabel,
            feedId,
            userId: user.userId,
          });
        }

        const removeLabel = parseUserLabel(removeTag);
        if (removeLabel) {
          await removeUserFeedCategory(tx, {
            category: removeLabel,
            feedId,
            userId: user.userId,
          });
        }
      }
    }
  });

  return textResponse("OK\n");
}

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
    subscriptionCount: rows.length,
    userId: user.userId,
  });

  return NextResponse.json({
    subscriptions: normalizedRows.map((row) => {
      const iconUrl = toReaderIconUrl(row.url);
      const categoryLabel = row.category?.trim();
      const normalizedCategoryLabel =
        categoryLabel === undefined || categoryLabel === ""
          ? null
          : categoryLabel;
      return {
        htmlUrl: row.url,
        id: `${FEED_STREAM_PREFIX}${row.url}`,
        title: row.title,
        url: row.url,
        ...(iconUrl ? { iconUrl } : {}),
        // Return an empty categories array for feeds with no resolved category
        // so NNW leaves them at the account top level rather than treating them
        // as belonging to "My Feeds" — which would cause an early return in
        // syncFeedFolderRelationship when "My Feeds" is absent from tag/list.
        categories: normalizedCategoryLabel
          ? [
              {
                id: `${USER_LABEL_PREFIX}${normalizedCategoryLabel}`,
                label: normalizedCategoryLabel,
              },
            ]
          : [],
        sortid: String(row.sourceId),
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

  if (quickAdd.length > 2048) {
    return NextResponse.json(
      { error: "Invalid feed URL", numResults: 0 },
      { status: 400 },
    );
  }

  const normalizedUrl = tryNormalizeFeedUrl(quickAdd);
  if (!normalizedUrl || !(await isAllowedFeedUrl(normalizedUrl))) {
    return NextResponse.json(
      { error: "Invalid feed URL", numResults: 0 },
      { status: 400 },
    );
  }

  const db = getDb();

  // Ensure the global Feed record exists (1 query: upsert + RETURNING).
  await ensureFeedRecordByUrl(db, normalizedUrl);

  const fallbackName = getUrlHostnameLabel(normalizedUrl, normalizedUrl);

  // Insert the subscription; ON CONFLICT DO NOTHING lets us detect duplicates
  // without a prior existence SELECT.
  const sources = await db
    .insert(feedSources)
    .values({
      name: fallbackName,
      url: normalizedUrl,
      userId: user.userId,
    })
    .onConflictDoNothing()
    .returning({ id: feedSources.id });

  if (sources.length === 0) {
    return NextResponse.json({
      error: `Already subscribed! ${normalizedUrl}`,
      numResults: 0,
      streamId: `${FEED_STREAM_PREFIX}${normalizedUrl}`,
    });
  }

  return NextResponse.json({
    numResults: 1,
    streamId: `${FEED_STREAM_PREFIX}${normalizedUrl}`,
  });
}
