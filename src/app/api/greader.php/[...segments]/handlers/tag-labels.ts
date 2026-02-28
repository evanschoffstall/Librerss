import { asTrimmedString, parseFormOrQueryParams } from "@/lib/api/http";
import { textResponse } from "@/lib/api/http";
import { type SessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/db";
import { feedCategories, feeds, feedSources } from "@/lib/db/schema";
import {
  DEFAULT_CATEGORY_LABEL,
  toOptionalCategoryLabel,
} from "@/lib/utils/categories";
import { logger } from "@/lib/logger";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  parseUserLabel,
  READ_STATE,
  READING_LIST_STREAM,
  STARRED_STATE,
  USER_LABEL_PREFIX,
} from "../constants";
import {
  maybeLoadCategoryFallback,
  resolveCategoryWithFallback,
} from "../services/categories";

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
  const categoryFallbackByUrl = await maybeLoadCategoryFallback(
    user.userId,
    rows,
  );

  const resolvedCategories = rows.map((row) =>
    resolveCategoryWithFallback(row.category, row.url, categoryFallbackByUrl),
  );

  const hasUncategorized = resolvedCategories.some(
    (cat) => !toOptionalCategoryLabel(cat),
  );

  const namedLabels = Array.from(
    new Set(
      resolvedCategories
        .map((cat) => toOptionalCategoryLabel(cat))
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
      { id: READING_LIST_STREAM, sortid: "0" },
      { id: READ_STATE, sortid: "1" },
      { id: STARRED_STATE, sortid: "2" },
      ...normalizedLabels.map((label, index) => ({
        id: `${USER_LABEL_PREFIX}${label}`,
        sortid: String(index + 10),
      })),
    ],
  });
}

export async function handleDisableTag(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  if (params instanceof Response) {
    return params;
  }

  const tagId = asTrimmedString(params.get("s"));
  // Not a user label — nothing to disable (system tags like reading-list are not deletable).
  const label = parseUserLabel(tagId);
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

  const sourceTag = asTrimmedString(params.get("s"));
  const destTag = asTrimmedString(params.get("dest"));

  const oldLabel = parseUserLabel(sourceTag);
  const newLabel = parseUserLabel(destTag);
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
