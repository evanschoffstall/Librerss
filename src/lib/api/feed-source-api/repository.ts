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
 * Create the or update feed source.
 * @param tx - The tx.
 * @param userId - The r id.
 * @param payload - The payload.
 * @returns The or update feed source.
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
 * Process the delete feed source for user.
 * @param userId - The r id.
 * @param sourceId - The source id.
 * @returns The delete feed source for user.
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
 * Process the list feed sources for user.
 * @param userId - The r id.
 * @returns The list feed sources for user.
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
 * Process the rename feed source for user.
 * @param userId - The r id.
 * @param sourceId - The source id.
 * @param name - The name.
 * @param url - The url.
 * @returns The rename feed source for user.
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
 * Process the set feed source enabled for user.
 * @param userId - The r id.
 * @param sourceId - The source id.
 * @param enabled - The enabled.
 * @returns The set feed source enabled for user.
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
 * Process the to feed source response.
 * @param row - The row.
 * @returns The to feed source response.
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
 * Update the feed settings for user.
 * @param userId - The r id.
 * @param sourceId - The source id.
 * @param settings - The settings.
 * @returns The feed settings for user.
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
 * Process the find existing feed source.
 * @param tx - The tx.
 * @param userId - The r id.
 * @param normalizedUrl - The d url.
 * @returns The find existing feed source.
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
 * Process the upsert feed source.
 * @param tx - The tx.
 * @param userId - The r id.
 * @param name - The name.
 * @param normalizedUrl - The d url.
 * @returns The upsert feed source.
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
