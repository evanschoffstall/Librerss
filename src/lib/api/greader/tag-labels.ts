import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { resolveCategoryLabelsByUrl } from "./categories";
import { loadUserSubscriptionRows } from "./subscription-data";

import {
  asTrimmedString,
  parseFormOrQueryParams,
  textResponse,
} from "@/lib/api/http";
import { type SessionUser } from "@/lib/auth/session";
import {
  parseUserLabel,
  READ_STATE,
  READING_LIST_STREAM,
  STARRED_STATE,
  USER_LABEL_PREFIX,
} from "@/lib/core/stream-ids";
import { getDb } from "@/lib/db/db";
import { feedCategories } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  DEFAULT_CATEGORY_LABEL,
  toOptionalCategoryLabel,
} from "@/lib/utils/categories";

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
    label,
    userId: user.userId,
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
    newLabel,
    oldLabel,
    userId: user.userId,
  });

  return textResponse("OK\n");
}

export async function handleTagList(user: SessionUser): Promise<Response> {
  const rows = await loadUserSubscriptionRows(user.userId);

  // Apply the same URL-normalisation fallback as subscription/list so that
  // the category IDs in tag/list always match what subscription/list emits.
  const resolvedCategories = await resolveCategoryLabelsByUrl(
    user.userId,
    rows,
    (row) => row.url,
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
