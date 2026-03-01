import { getDb } from "@/lib/db/db";
import {
  ensureFeedRecordByUrl,
  findFeedIdByUrl,
  removeUserFeedCategory,
  replaceUserFeedCategory,
} from "@/lib/db/feed-records";
import { feedCategories, feeds, feedSources } from "@/lib/db/schema";
import {
  DEFAULT_CATEGORY_LABEL,
  normalizeCategory,
  toCategoryLabelOrDefault,
} from "@/lib/utils/categories";
import { normalizeFeedUrl } from "@/lib/utils/url";
import { and, eq } from "drizzle-orm";
import type {
  CreateFeedPayload,
  CreateFeedSourceResult,
  FeedSourceListRow,
  FeedSourceRecord,
  FeedTransaction,
} from "./types";

const feedSourceFields = {
  id: feedSources.id,
  name: feedSources.name,
  url: feedSources.url,
  enabled: feedSources.enabled,
  extractionDisabled: feedSources.extractionDisabled,
  proxyEnabled: feedSources.proxyEnabled,
};

export function toFeedSourceResponse(
  row: FeedSourceListRow,
): FeedSourceListRow {
  return {
    ...row,
    category: toCategoryLabelOrDefault(row.category),
  };
}

export async function listFeedSourcesForUser(
  userId: number,
): Promise<FeedSourceListRow[]> {
  const db = getDb();

  return db
    .select({
      id: feedSources.id,
      name: feedSources.name,
      url: feedSources.url,
      enabled: feedSources.enabled,
      extractionDisabled: feedSources.extractionDisabled,
      proxyEnabled: feedSources.proxyEnabled,
      category: feedCategories.category,
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

export async function createOrUpdateFeedSource(
  tx: FeedTransaction,
  userId: number,
  payload: CreateFeedPayload,
): Promise<CreateFeedSourceResult> {
  const normalizedUrl = normalizeFeedUrl(payload.url);
  const feed = await ensureFeedRecordByUrl(tx, normalizedUrl);

  await replaceUserFeedCategory(tx, {
    userId,
    feedId: feed.id,
    category: normalizeCategory(payload.category),
  });

  return upsertFeedSource(tx, userId, payload.name, normalizedUrl);
}

export async function renameFeedSourceForUser(
  userId: number,
  sourceId: number,
  name: string,
  url: string,
): Promise<FeedSourceRecord | null> {
  const db = getDb();
  const normalizedUrl = normalizeFeedUrl(url);

  const [updatedSource] = await db.transaction(async (tx) => {
    // Lock the row inside the transaction so concurrent renames serialize and
    // can't race between the URL read and the category transfer.
    const [existingSource] = await tx
      .select({ id: feedSources.id, url: feedSources.url })
      .from(feedSources)
      .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
      .for("update")
      .limit(1);

    if (!existingSource) return [];

    if (existingSource.url !== normalizedUrl) {
      const nextFeed = await ensureFeedRecordByUrl(tx, normalizedUrl);
      const previousFeedId = await findFeedIdByUrl(tx, existingSource.url);
      let previousCategory = DEFAULT_CATEGORY_LABEL;

      if (previousFeedId) {
        const [existingCategory] = await tx
          .select({ category: feedCategories.category })
          .from(feedCategories)
          .where(
            and(
              eq(feedCategories.userId, userId),
              eq(feedCategories.feedId, previousFeedId),
            ),
          )
          .limit(1);

        previousCategory = toCategoryLabelOrDefault(existingCategory?.category);
      }

      if (previousFeedId) {
        await removeUserFeedCategory(tx, {
          userId,
          feedId: previousFeedId,
        });
      }

      await replaceUserFeedCategory(tx, {
        userId,
        feedId: nextFeed.id,
        category: previousCategory,
      });
    }

    return tx
      .update(feedSources)
      .set({ name, url: normalizedUrl })
      .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
      .returning(feedSourceFields);
  });

  return updatedSource ?? null;
}

export async function deleteFeedSourceForUser(
  userId: number,
  sourceId: number,
): Promise<FeedSourceRecord | null> {
  const db = getDb();

  const [sourceToDelete] = await db
    .select(feedSourceFields)
    .from(feedSources)
    .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
    .limit(1);

  if (!sourceToDelete) {
    return null;
  }

  const [feedForSource] = await db
    .select({ id: feeds.id })
    .from(feeds)
    .where(eq(feeds.url, sourceToDelete.url))
    .limit(1);

  const [deletedSource] = await db.transaction(async (tx) => {
    if (feedForSource) {
      await tx
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.userId, userId),
            eq(feedCategories.feedId, feedForSource.id),
          ),
        );
    }

    return tx
      .delete(feedSources)
      .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
      .returning(feedSourceFields);
  });

  return deletedSource ?? null;
}

export async function setFeedSourceEnabledForUser(
  userId: number,
  sourceId: number,
  enabled: boolean,
): Promise<FeedSourceRecord | null> {
  const db = getDb();

  const [updatedSource] = await db
    .update(feedSources)
    .set({ enabled })
    .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
    .returning(feedSourceFields);

  return updatedSource ?? null;
}

export async function updateFeedSettingsForUser(
  userId: number,
  sourceId: number,
  settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
): Promise<FeedSourceRecord | null> {
  const db = getDb();
  const setClause: Record<string, boolean> = {};
  if (typeof settings.extractionDisabled === "boolean")
    setClause.extractionDisabled = settings.extractionDisabled;
  if (typeof settings.proxyEnabled === "boolean")
    setClause.proxyEnabled = settings.proxyEnabled;
  if (Object.keys(setClause).length === 0) return null;

  const [updatedSource] = await db
    .update(feedSources)
    .set(setClause)
    .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
    .returning(feedSourceFields);

  return updatedSource ?? null;
}

async function upsertFeedSource(
  tx: FeedTransaction,
  userId: number,
  name: string,
  normalizedUrl: string,
): Promise<CreateFeedSourceResult> {
  const [existingSource] = await tx
    .select(feedSourceFields)
    .from(feedSources)
    .where(
      and(eq(feedSources.userId, userId), eq(feedSources.url, normalizedUrl)),
    )
    .limit(1);

  if (existingSource) {
    const [updatedSource] = await tx
      .update(feedSources)
      .set({ name, enabled: true })
      .where(
        and(
          eq(feedSources.id, existingSource.id),
          eq(feedSources.userId, userId),
        ),
      )
      .returning(feedSourceFields);

    if (!updatedSource) {
      throw new Error("Failed to update feed source");
    }

    return { sourceRecord: updatedSource, isNew: false };
  }

  const [createdSource] = await tx
    .insert(feedSources)
    .values({ userId, name, url: normalizedUrl, enabled: true })
    .returning(feedSourceFields);

  if (!createdSource) {
    throw new Error("Failed to create feed source");
  }

  return { sourceRecord: createdSource, isNew: true };
}
