import { parseFormOrQueryParams } from "@/lib/api/request";
import { type SessionUser } from "@/lib/auth/session";
import { isAllowedFeedUrl } from "@/lib/core/feed-fetcher";
import { getDb } from "@/lib/db/db";
import {
  ensureFeedRecordByUrl,
  findFeedIdByUrl,
  removeUserFeedCategory,
  replaceUserFeedCategory,
} from "@/lib/db/feed-records";
import { feedCategories, feeds, feedSources } from "@/lib/db/schema";
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils/categories";
import { getUrlHostnameLabel, tryNormalizeFeedUrl } from "@/lib/utils/url";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { toReaderCategoryLabel, toReaderIconUrl } from "../utils/mappers";
import { textResponse } from "../utils/responses";

export async function handleTagList(user: SessionUser): Promise<Response> {
  const db = getDb();
  const labels = await db
    .select({ category: feedCategories.category })
    .from(feedCategories)
    .where(eq(feedCategories.userId, user.userId))
    .groupBy(feedCategories.category);

  const normalizedLabels = Array.from(
    new Set([
      DEFAULT_CATEGORY_LABEL,
      ...labels
        .map((label) => label.category?.trim())
        .filter((label): label is string => Boolean(label)),
    ]),
  );

  return NextResponse.json({
    tags: [
      { id: "user/-/state/com.google/reading-list", sortid: "0" },
      { id: "user/-/state/com.google/read", sortid: "1" },
      { id: "user/-/state/com.google/starred", sortid: "2" },
      ...normalizedLabels.map((label, index) => ({
        id: `user/-/label/${label}`,
        sortid: String(index + 10),
      })),
    ],
  });
}

export async function handleSubscriptionList(
  user: SessionUser,
): Promise<Response> {
  const db = getDb();

  const rows = await db
    .select({
      sourceId: feedSources.id,
      title: feedSources.name,
      url: feedSources.url,
      feedId: feeds.id,
      category: feedCategories.category,
    })
    .from(feedSources)
    .leftJoin(feeds, eq(feeds.url, feedSources.url))
    .leftJoin(
      feedCategories,
      and(
        eq(feedCategories.userId, feedSources.userId),
        eq(feedCategories.feedId, feeds.id),
      ),
    )
    .where(eq(feedSources.userId, user.userId));

  console.info("[greader] subscription/list", {
    userId: user.userId,
    subscriptionCount: rows.length,
  });

  return NextResponse.json({
    subscriptions: rows.map((row) => {
      const categoryLabel = toReaderCategoryLabel(row.category);
      return {
        id: `feed/${row.url}`,
        title: row.title,
        url: row.url,
        htmlUrl: row.url,
        iconUrl: toReaderIconUrl(row.url),
        sortid: String(row.sourceId),
        categories: [
          {
            id: `user/-/label/${categoryLabel}`,
            label: categoryLabel,
          },
        ],
      };
    }),
  });
}

export async function handleSubscriptionQuickAdd(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
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
      streamId: `feed/${normalizedUrl}`,
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
    streamId: `feed/${normalizedUrl}`,
  });
}

export async function handleSubscriptionEdit(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  const subscriptionId = params.get("s")?.trim() ?? "";
  const action = params.get("ac")?.trim() ?? "";
  const title = params.get("t")?.trim() ?? "";
  const addTag = params.get("a")?.trim() ?? "";
  const removeTag = params.get("r")?.trim() ?? "";

  if (!subscriptionId.startsWith("feed/")) {
    return textResponse("OK\n");
  }

  const feedUrl = subscriptionId.slice("feed/".length);
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

  if (addTag.startsWith("user/-/label/")) {
    const label = addTag.slice("user/-/label/".length);
    const feedId = await findFeedIdByUrl(db, feedUrl);

    if (feedId && label) {
      await replaceUserFeedCategory(db, {
        userId: user.userId,
        feedId,
        category: label,
      });
    }
  }

  if (removeTag.startsWith("user/-/label/")) {
    const label = removeTag.slice("user/-/label/".length);
    const feedId = await findFeedIdByUrl(db, feedUrl);

    if (feedId && label) {
      await removeUserFeedCategory(db, {
        userId: user.userId,
        feedId,
        category: label,
      });
    }
  }

  return textResponse("OK\n");
}

export async function handleDisableTag(): Promise<Response> {
  return textResponse("OK\n");
}

export async function handleRenameTag(): Promise<Response> {
  return textResponse("OK\n");
}
