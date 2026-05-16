import { and, eq } from "drizzle-orm";

import {
  ensureFeedRecordByUrl,
  feedCategories,
  feeds,
  feedSources,
  findFeedIdByUrl,
  getDb,
  removeUserFeedCategory,
  replaceUserFeedCategory,
} from "@/lib/db";
import {
  DEFAULT_CATEGORY_LABEL,
  normalizeCategory,
  normalizeFeedUrl,
  toCategoryLabelOrDefault,
} from "@/lib/utils";

import type {
  CreateFeedPayload,
  CreateFeedSourceResult,
  FeedSourceListRow,
  FeedSourceRecord,
  FeedTransaction,
} from "./types";

const feedSourceFields = {
  enabled: feedSources.enabled,
  extractionDisabled: feedSources.extractionDisabled,
  id: feedSources.id,
  name: feedSources.name,
  proxyEnabled: feedSources.proxyEnabled,
  url: feedSources.url,
};

/**
 * Describes the feed settings for user settings.
 */
interface FeedSettingsForUserSettings {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
}

/**
 * Create or update the feed source for the given user within an open transaction.
 * @param tx - The tx.
 * @param userId - The user ID.
 * @param payload - The payload.
 * @returns The upsert result with the source record and a flag indicating whether it was newly created.
 */
export async function createOrUpdateFeedSource(
  tx: FeedTransaction,
  userId: number,
  payload: CreateFeedPayload,
): Promise<CreateFeedSourceResult> {
  const normalizedUrl = normalizeFeedUrl(payload.url);
  const feed = await ensureFeedRecordByUrl(tx, normalizedUrl);

  await replaceUserFeedCategory(tx, {
    category: normalizeCategory(payload.category),
    feedId: feed.id,
    userId,
  });

  return upsertFeedSource(tx, userId, payload.name, normalizedUrl);
}

/**
 * Delete the feed source owned by the given user, also removing its category association.
 * @param userId - The user ID.
 * @param sourceId - The source id.
 * @returns The deleted feed source record, or null if no matching source was found.
 */
export async function deleteFeedSourceForUser(
  userId: number,
  sourceId: number,
): Promise<FeedSourceRecord | null> {
  const db = getDb();

  const deletedSources = await db.transaction(async (tx) => {
    // Lock only the owned feed-source row. PostgreSQL rejects FOR UPDATE on
    // the nullable side of an outer join, so resolve the feed id separately.
    const sourceRows = await tx
      .select(feedSourceFields)
      .from(feedSources)
      .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
      .for("update")
      .limit(1);

    if (sourceRows.length === 0) return [];

    const sourceToDelete = sourceRows[0];
    const feedId = await findFeedIdByUrl(tx, sourceToDelete.url);

    if (feedId !== null) {
      await tx
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.userId, userId),
            eq(feedCategories.feedId, feedId),
          ),
        );
    }

    return tx
      .delete(feedSources)
      .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
      .returning(feedSourceFields);
  });

  return deletedSources[0] ?? null;
}

/**
 * Return all feed sources owned by the user, joined with their current category assignment.
 * @param userId - The user ID.
 * @returns An array of feed source rows ordered by name.
 */
export async function listFeedSourcesForUser(
  userId: number,
): Promise<FeedSourceListRow[]> {
  const db = getDb();

  return db
    .select({
      category: feedCategories.category,
      enabled: feedSources.enabled,
      extractionDisabled: feedSources.extractionDisabled,
      id: feedSources.id,
      name: feedSources.name,
      proxyEnabled: feedSources.proxyEnabled,
      url: feedSources.url,
    })
    .from(feedSources)
    .leftJoin(feeds, eq(feeds.url, feedSources.url))
    .leftJoin(
      feedCategories,
      and(
        eq(feedCategories.feedId, feeds.id),
        eq(feedCategories.userId, userId),
      ),
    )
    .where(eq(feedSources.userId, userId))
    .orderBy(feedSources.name);
}

/**
 * Rename a feed source and optionally change its URL, transferring the category association when the URL changes.
 * @param userId - The user ID.
 * @param sourceId - The source id.
 * @param name - The name.
 * @param url - The url.
 * @returns The updated feed source record, or null if no matching source was found.
 */
export async function renameFeedSourceForUser(
  userId: number,
  sourceId: number,
  name: string,
  url: string,
): Promise<FeedSourceRecord | null> {
  const db = getDb();
  const normalizedUrl = normalizeFeedUrl(url);

  const updatedSources = await db.transaction(async (tx) => {
    // Lock the row inside the transaction so concurrent renames serialize and
    // can't race between the URL read and the category transfer.
    const existingSources = await tx
      .select({ id: feedSources.id, url: feedSources.url })
      .from(feedSources)
      .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
      .for("update")
      .limit(1);

    if (existingSources.length === 0) return [];

    const existingSource = existingSources[0];

    if (existingSource.url !== normalizedUrl) {
      // These two lookups are independent — run them concurrently.
      const [nextFeed, previousFeedId] = await Promise.all([
        ensureFeedRecordByUrl(tx, normalizedUrl),
        findFeedIdByUrl(tx, existingSource.url),
      ]);
      let previousCategory = DEFAULT_CATEGORY_LABEL;

      if (previousFeedId !== null) {
        const existingCategoryRows = await tx
          .select({ category: feedCategories.category })
          .from(feedCategories)
          .where(
            and(
              eq(feedCategories.userId, userId),
              eq(feedCategories.feedId, previousFeedId),
            ),
          )
          .limit(1);

        const previousCategoryValue =
          existingCategoryRows.length > 0
            ? existingCategoryRows[0].category
            : null;
        previousCategory = toCategoryLabelOrDefault(previousCategoryValue);
      }

      if (previousFeedId !== null) {
        await removeUserFeedCategory(tx, {
          feedId: previousFeedId,
          userId,
        });
      }

      await replaceUserFeedCategory(tx, {
        category: previousCategory,
        feedId: nextFeed.id,
        userId,
      });
    }

    return tx
      .update(feedSources)
      .set({ name, url: normalizedUrl })
      .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
      .returning(feedSourceFields);
  });

  return updatedSources[0] ?? null;
}

/**
 * Toggle the enabled flag on a feed source owned by the given user.
 * @param userId - The user ID.
 * @param sourceId - The source id.
 * @param enabled - The enabled.
 * @returns The updated feed source record, or null if no matching source was found.
 */
export async function setFeedSourceEnabledForUser(
  userId: number,
  sourceId: number,
  enabled: boolean,
): Promise<FeedSourceRecord | null> {
  const db = getDb();

  const updatedSources = await db
    .update(feedSources)
    .set({ enabled })
    .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
    .returning(feedSourceFields);

  return updatedSources[0] ?? null;
}
/**
 * Normalize a feed source list row for API response, applying the default category label when absent.
 * @param row - The row.
 * @returns The normalized feed source row with a guaranteed category string.
 */
export function toFeedSourceResponse(
  row: FeedSourceListRow,
): FeedSourceListRow {
  return {
    ...row,
    category: toCategoryLabelOrDefault(row.category),
  };
}

/**
 * Update per-source extraction and proxy settings for a feed source owned by the given user.
 * @param userId - The user ID.
 * @param sourceId - The source id.
 * @param settings - The settings.
 * @returns The updated feed source record, or null when no matching source was found or no fields changed.
 */
export async function updateFeedSettingsForUser(
  userId: number,
  sourceId: number,
  settings: FeedSettingsForUserSettings,
): Promise<FeedSourceRecord | null> {
  const db = getDb();
  const setClause: {
    extractionDisabled?: boolean;
    proxyEnabled?: boolean;
  } = {};
  if (typeof settings.extractionDisabled === "boolean")
    setClause.extractionDisabled = settings.extractionDisabled;
  if (typeof settings.proxyEnabled === "boolean")
    setClause.proxyEnabled = settings.proxyEnabled;
  if (
    setClause.extractionDisabled === undefined &&
    setClause.proxyEnabled === undefined
  ) {
    return null;
  }

  const updatedSources = await db
    .update(feedSources)
    .set(setClause)
    .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
    .returning(feedSourceFields);

  return updatedSources[0] ?? null;
}

/**
 * Look up an existing feed source row for the user by normalized URL within an open transaction.
 * @param tx - The tx.
 * @param userId - The user ID.
 * @param normalizedUrl - The normalized URL.
 * @returns The matching feed source record, or undefined when none exists.
 */
async function findExistingFeedSource(
  tx: FeedTransaction,
  userId: number,
  normalizedUrl: string,
): Promise<FeedSourceRecord | undefined> {
  const existingSources = await tx
    .select(feedSourceFields)
    .from(feedSources)
    .where(
      and(eq(feedSources.userId, userId), eq(feedSources.url, normalizedUrl)),
    )
    .limit(1);

  return existingSources[0];
}

/**
 * Insert a new feed source or re-enable and rename an existing one within an open transaction.
 * @param tx - The tx.
 * @param userId - The user ID.
 * @param name - The name.
 * @param normalizedUrl - The normalized URL.
 * @returns The upsert result with the source record and a flag indicating whether it was newly created.
 */
async function upsertFeedSource(
  tx: FeedTransaction,
  userId: number,
  name: string,
  normalizedUrl: string,
): Promise<CreateFeedSourceResult> {
  const existingSource = await findExistingFeedSource(
    tx,
    userId,
    normalizedUrl,
  );

  if (existingSource) {
    const updatedSources = await tx
      .update(feedSources)
      .set({ enabled: true, name })
      .where(
        and(
          eq(feedSources.id, existingSource.id),
          eq(feedSources.userId, userId),
        ),
      )
      .returning(feedSourceFields);

    if (updatedSources.length === 0) {
      throw new Error("Failed to update feed source");
    }

    return { isNew: false, sourceRecord: updatedSources[0] };
  }

  const createdSources = await tx
    .insert(feedSources)
    .values({ enabled: true, name, url: normalizedUrl, userId })
    .returning(feedSourceFields);

  if (createdSources.length === 0) {
    throw new Error("Failed to create feed source");
  }

  return { isNew: true, sourceRecord: createdSources[0] };
}
