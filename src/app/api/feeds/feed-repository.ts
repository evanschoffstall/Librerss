import { DEFAULT_CATEGORY_LABEL, normalizeCategory } from "@/lib";
import { getDb } from "@/lib/db/db";
import {
  ensureFeedRecordByUrl,
  replaceUserFeedCategory,
} from "@/lib/db/feed-records";
import { feedCategories, feeds, feedSources } from "@/lib/db/schema";
import { normalizeFeedUrl } from "@/lib/utils/url";
import { and, eq } from "drizzle-orm";
import type {
  CreateFeedPayload,
  CreateFeedSourceResult,
  FeedSourceListRow,
  FeedSourceRecord,
  FeedTransaction,
} from "./feed-types";

export function toFeedSourceResponse(
  row: FeedSourceListRow,
): FeedSourceListRow {
  return {
    ...row,
    category: row.category?.trim() || DEFAULT_CATEGORY_LABEL,
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
): Promise<FeedSourceRecord | null> {
  const db = getDb();

  const [updatedSource] = await db
    .update(feedSources)
    .set({ name })
    .where(and(eq(feedSources.id, sourceId), eq(feedSources.userId, userId)))
    .returning({
      id: feedSources.id,
      name: feedSources.name,
      url: feedSources.url,
    });

  return updatedSource ?? null;
}

export async function deleteFeedSourceForUser(
  userId: number,
  sourceId: number,
): Promise<FeedSourceRecord | null> {
  const db = getDb();

  const [sourceToDelete] = await db
    .select({
      id: feedSources.id,
      name: feedSources.name,
      url: feedSources.url,
    })
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
      .returning({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      });
  });

  return deletedSource ?? null;
}

async function upsertFeedSource(
  tx: FeedTransaction,
  userId: number,
  name: string,
  normalizedUrl: string,
): Promise<CreateFeedSourceResult> {
  const [existingSource] = await tx
    .select({
      id: feedSources.id,
      name: feedSources.name,
      url: feedSources.url,
    })
    .from(feedSources)
    .where(
      and(eq(feedSources.userId, userId), eq(feedSources.url, normalizedUrl)),
    )
    .limit(1);

  if (existingSource) {
    const [updatedSource] = await tx
      .update(feedSources)
      .set({ name })
      .where(
        and(
          eq(feedSources.id, existingSource.id),
          eq(feedSources.userId, userId),
        ),
      )
      .returning({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      });

    if (!updatedSource) {
      throw new Error("Failed to update feed source");
    }

    return { sourceRecord: updatedSource, isNew: false };
  }

  const [createdSource] = await tx
    .insert(feedSources)
    .values({ userId, name, url: normalizedUrl })
    .returning({
      id: feedSources.id,
      name: feedSources.name,
      url: feedSources.url,
    });

  if (!createdSource) {
    throw new Error("Failed to create feed source");
  }

  return { sourceRecord: createdSource, isNew: true };
}
