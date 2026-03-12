import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/db";
import { feedCategories, feeds } from "@/lib/db/schema";
import { toOptionalCategoryLabel } from "@/lib/utils/categories";
import { toCategoryLookupKey } from "@/lib/utils/url";

interface CategoryRow {
  category: string;
  feedUrl: string;
}

interface RowWithCategory {
  category?: null | string;
}

export async function resolveCategoryLabelsByUrl<T extends RowWithCategory>(
  userId: number,
  rows: T[],
  getUrl: (row: T) => null | string | undefined,
): Promise<(null | string)[]> {
  const normalizedRows = await withResolvedCategoryByUrl(userId, rows, getUrl);
  return normalizedRows.map((row) => row.category);
}

export function resolveCategoryWithFallback(
  category: null | string | undefined,
  feedUrl: null | string | undefined,
  fallbackByUrlKey: Map<string, string>,
): null | string {
  const normalizedCategory = toOptionalCategoryLabel(category);
  if (normalizedCategory) {
    return normalizedCategory;
  }

  if (!feedUrl) return null;
  const lookupKey = toCategoryLookupKey(feedUrl);
  return lookupKey ? (fallbackByUrlKey.get(lookupKey) ?? null) : null;
}

export async function withResolvedCategoryByUrl<T extends RowWithCategory>(
  userId: number,
  rows: T[],
  getUrl: (row: T) => null | string | undefined,
): Promise<(Omit<T, "category"> & { category: null | string })[]> {
  // Collect only the URLs where a fallback lookup is actually needed.
  const missingUrls = rows
    .filter((row) => !toOptionalCategoryLabel(row.category))
    .map((row) => getUrl(row))
    .filter((url): url is string => !!url);

  const categoryFallbackByUrl = await maybeLoadCategoryFallback(
    userId,
    missingUrls,
  );
  return rows.map((row) => ({
    ...row,
    category: resolveCategoryWithFallback(
      row.category,
      getUrl(row),
      categoryFallbackByUrl,
    ),
  }));
}

function buildCategoryFallbackMap(rows: CategoryRow[]): Map<string, string> {
  const fallbackByUrlKey = new Map<string, string>();

  for (const row of rows) {
    const categoryLabel = toOptionalCategoryLabel(row.category);
    if (!categoryLabel) {
      continue;
    }

    const key = toCategoryLookupKey(row.feedUrl);
    if (!key || fallbackByUrlKey.has(key)) {
      continue;
    }

    fallbackByUrlKey.set(key, categoryLabel);
  }

  return fallbackByUrlKey;
}

async function loadUserCategoryFallbackByFeedUrls(
  userId: number,
  feedUrls: string[],
): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({
      category: feedCategories.category,
      feedUrl: feeds.url,
    })
    .from(feedCategories)
    .innerJoin(feeds, eq(feeds.id, feedCategories.feedId))
    .where(
      and(eq(feedCategories.userId, userId), inArray(feeds.url, feedUrls)),
    );

  return buildCategoryFallbackMap(rows);
}

async function maybeLoadCategoryFallback(
  userId: number,
  missingUrls: string[],
): Promise<Map<string, string>> {
  return missingUrls.length > 0
    ? loadUserCategoryFallbackByFeedUrls(userId, missingUrls)
    : new Map<string, string>();
}
