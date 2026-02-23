import { getDb } from "@/lib/db/db";
import { feedCategories, feeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type CategoryRow = {
  category: string;
  feedUrl: string;
};

export function toCategoryLookupKey(feedUrl: string): string {
  const trimmed = feedUrl.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    const search = parsed.search;
    return `${host}${pathname}${search}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
  }
}

export function resolveCategoryWithFallback(
  category: string | null | undefined,
  feedUrl: string,
  fallbackByUrlKey: Map<string, string>,
): string | null {
  const normalizedCategory = category?.trim();
  if (normalizedCategory) {
    return normalizedCategory;
  }

  const lookupKey = toCategoryLookupKey(feedUrl);
  return lookupKey ? (fallbackByUrlKey.get(lookupKey) ?? null) : null;
}

export async function loadUserCategoryFallbackByFeedUrl(
  userId: number,
): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({
      category: feedCategories.category,
      feedUrl: feeds.url,
    })
    .from(feedCategories)
    .innerJoin(feeds, eq(feeds.id, feedCategories.feedId))
    .where(eq(feedCategories.userId, userId));

  return buildCategoryFallbackMap(rows);
}

function buildCategoryFallbackMap(rows: CategoryRow[]): Map<string, string> {
  const fallbackByUrlKey = new Map<string, string>();

  for (const row of rows) {
    const categoryLabel = row.category?.trim();
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
