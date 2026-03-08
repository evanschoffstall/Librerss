import { getDb } from "@/lib/db/db";
import { feedCategories, feeds } from "@/lib/db/schema";
import { toOptionalCategoryLabel } from "@/lib/utils/categories";
import { toCategoryLookupKey } from "@/lib/utils/url";
import { and, eq, inArray } from "drizzle-orm";

type CategoryRow = {
  category: string;
  feedUrl: string;
};

type RowWithCategory = {
  category?: string | null;
};

export function resolveCategoryWithFallback(
  category: string | null | undefined,
  feedUrl: string | null | undefined,
  fallbackByUrlKey: Map<string, string>,
): string | null {
  const normalizedCategory = toOptionalCategoryLabel(category);
  if (normalizedCategory) {
    return normalizedCategory;
  }

  if (!feedUrl) return null;
  const lookupKey = toCategoryLookupKey(feedUrl);
  return lookupKey ? (fallbackByUrlKey.get(lookupKey) ?? null) : null;
}

async function maybeLoadCategoryFallback(
  userId: number,
  missingUrls: string[],
): Promise<Map<string, string>> {
  return missingUrls.length > 0
    ? loadUserCategoryFallbackByFeedUrls(userId, missingUrls)
    : new Map<string, string>();
}

export async function withResolvedCategoryByUrl<T extends RowWithCategory>(
  userId: number,
  rows: T[],
  getUrl: (row: T) => string | null | undefined,
): Promise<Array<Omit<T, "category"> & { category: string | null }>> {
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

export async function resolveCategoryLabelsByUrl<T extends RowWithCategory>(
  userId: number,
  rows: T[],
  getUrl: (row: T) => string | null | undefined,
): Promise<Array<string | null>> {
  const normalizedRows = await withResolvedCategoryByUrl(userId, rows, getUrl);
  return normalizedRows.map((row) => row.category);
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
