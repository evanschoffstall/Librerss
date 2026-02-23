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
import { logger } from "@/lib/utils/logger";
import { getUrlHostnameLabel, tryNormalizeFeedUrl } from "@/lib/utils/url";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  loadUserCategoryFallbackByFeedUrl,
  resolveCategoryWithFallback,
} from "../utils/categories";
import { toReaderIconUrl } from "../utils/mappers";
import { textResponse } from "../utils/responses";

export async function handleTagList(user: SessionUser): Promise<Response> {
  const db = getDb();

  // Query all FeedSources with their category assignments so we can both
  // collect the distinct labels AND detect whether any feed is uncategorized.
  // Include the URL so we can apply the same category fallback used by
  // subscription/list — ensuring both responses agree on which categories exist.
  const rows = await db
    .select({ category: feedCategories.category, url: feedSources.url })
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

  // Apply the same URL-normalisation fallback as subscription/list so that
  // the category IDs in tag/list always match what subscription/list emits.
  const needsCategoryFallback = rows.some((row) => !row.category?.trim());
  const categoryFallbackByUrl = needsCategoryFallback
    ? await loadUserCategoryFallbackByFeedUrl(user.userId)
    : new Map<string, string>();

  const resolvedCategories = rows.map((row) =>
    resolveCategoryWithFallback(row.category, row.url, categoryFallbackByUrl),
  );

  const hasUncategorized = resolvedCategories.some((cat) => !cat?.trim());

  const namedLabels = Array.from(
    new Set(
      resolvedCategories
        .map((cat) => cat?.trim())
        .filter((label): label is string => Boolean(label)),
    ),
  );

  // Only include "My Feeds" when at least one feed has no category assigned,
  // or as a last resort when the user has no category labels at all.
  const normalizedLabels =
    hasUncategorized || namedLabels.length === 0
      ? [
          DEFAULT_CATEGORY_LABEL,
          ...namedLabels.filter((l) => l !== DEFAULT_CATEGORY_LABEL),
        ]
      : namedLabels;

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

  const needsCategoryFallback = rows.some((row) => !row.category?.trim());
  const categoryFallbackByUrl = needsCategoryFallback
    ? await loadUserCategoryFallbackByFeedUrl(user.userId)
    : new Map<string, string>();

  logger.info("[greader] subscription/list", {
    userId: user.userId,
    subscriptionCount: rows.length,
  });

  return NextResponse.json({
    subscriptions: rows.map((row) => {
      const resolvedCategory = resolveCategoryWithFallback(
        row.category,
        row.url,
        categoryFallbackByUrl,
      );
      const categoryLabel = resolvedCategory?.trim() || null;
      return {
        id: `feed/${row.url}`,
        title: row.title,
        url: row.url,
        htmlUrl: row.url,
        iconUrl: toReaderIconUrl(row.url),
        sortid: String(row.sourceId),
        // Return an empty categories array for feeds with no resolved category
        // so NNW leaves them at the account top level rather than treating them
        // as belonging to "My Feeds" — which would cause an early return in
        // syncFeedFolderRelationship when "My Feeds" is absent from tag/list.
        categories: categoryLabel
          ? [{ id: `user/-/label/${categoryLabel}`, label: categoryLabel }]
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
  if (params instanceof Response) {
    return params;
  }
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

  const hasTagChange =
    addTag.startsWith("user/-/label/") || removeTag.startsWith("user/-/label/");

  if (hasTagChange) {
    const feedId = await findFeedIdByUrl(db, feedUrl);

    if (feedId) {
      const stripLabelPrefix = (tag: string) =>
        tag.startsWith("user/-/label/")
          ? tag.slice("user/-/label/".length)
          : "";

      const addLabel = stripLabelPrefix(addTag);
      if (addLabel) {
        await replaceUserFeedCategory(db, {
          userId: user.userId,
          feedId,
          category: addLabel,
        });
      }

      const removeLabel = stripLabelPrefix(removeTag);
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

export async function handleDisableTag(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  if (params instanceof Response) {
    return params;
  }

  const tagId = params.get("s")?.trim() ?? "";
  if (!tagId.startsWith("user/-/label/")) {
    // Not a user label — nothing to disable (system tags like reading-list
    // are not deletable).
    return textResponse("OK\n");
  }

  const label = tagId.slice("user/-/label/".length);
  if (!label) {
    return textResponse("OK\n");
  }

  const db = getDb();
  await db
    .delete(feedCategories)
    .where(
      and(
        eq(feedCategories.userId, user.userId),
        eq(feedCategories.category, label),
      ),
    );

  logger.info("[greader] disable-tag", {
    userId: user.userId,
    label,
  });

  return textResponse("OK\n");
}

export async function handleRenameTag(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  if (params instanceof Response) {
    return params;
  }

  const sourceTag = params.get("s")?.trim() ?? "";
  const destTag = params.get("dest")?.trim() ?? "";

  if (
    !sourceTag.startsWith("user/-/label/") ||
    !destTag.startsWith("user/-/label/")
  ) {
    return textResponse("OK\n");
  }

  const oldLabel = sourceTag.slice("user/-/label/".length);
  const newLabel = destTag.slice("user/-/label/".length);
  if (!oldLabel || !newLabel || oldLabel === newLabel) {
    return textResponse("OK\n");
  }

  const db = getDb();
  await db
    .update(feedCategories)
    .set({ category: newLabel })
    .where(
      and(
        eq(feedCategories.userId, user.userId),
        eq(feedCategories.category, oldLabel),
      ),
    );

  logger.info("[greader] rename-tag", {
    userId: user.userId,
    oldLabel,
    newLabel,
  });

  return textResponse("OK\n");
}
