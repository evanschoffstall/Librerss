/**
 * Server-side feed source and category operations shared across API surfaces.
 *
 * Transport-agnostic: accepts typed params, returns data or throws
 * {@link ServerServiceError}. Both the REST API and future GReader API call
 * these functions.
 */
import { eq } from "drizzle-orm";

import type {
  CreateFeedPayload,
  FeedSourceRecord,
} from "@/lib/api/feed-source-api";

import { ServerServiceError } from "@/lib";
import {
  createOrUpdateFeedSource,
  deleteFeedSourceForUser,
  renameFeedSourceForUser,
  setFeedSourceEnabledForUser,
  updateFeedSettingsForUser,
} from "@/lib/api/feed-source-api";
import {
  invalidateUserCache,
  invalidateUserFeedSourceListCache,
} from "@/lib/core/server";
import { categoryOrders, getDb } from "@/lib/db";

/**
 * Describes the feed service deps.
 */
interface FeedServiceDeps {
  createOrUpdateFeedSourceFn?: typeof createOrUpdateFeedSource;
  deleteFeedSourceForUserFn?: typeof deleteFeedSourceForUser;
  getDbFn?: typeof getDb;
  renameFeedSourceForUserFn?: typeof renameFeedSourceForUser;
  setFeedSourceEnabledForUserFn?: typeof setFeedSourceEnabledForUser;
  updateFeedSettingsForUserFn?: typeof updateFeedSettingsForUser;
}

// ─── Feed source listing ──────────────────────────────────────────────────────

/**
 * Describes the feed settings settings.
 */
interface FeedSettingsSettings {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
}

/**
 * Create the feed.
 * @param userId - The r id.
 * @param payload - The payload.
 * @param deps - The deps.
 * @returns The feed.
 */
export async function createFeed(
  userId: number,
  payload: CreateFeedPayload,
  deps: Pick<FeedServiceDeps, "createOrUpdateFeedSourceFn" | "getDbFn"> = {},
) {
  const db = (deps.getDbFn ?? getDb)();
  const createOrUpdate =
    deps.createOrUpdateFeedSourceFn ?? createOrUpdateFeedSource;

  const result = await db.transaction((tx) =>
    createOrUpdate(tx, userId, payload),
  );

  invalidateUserCache(userId);
  invalidateUserFeedSourceListCache(userId);
  return result;
}

// ─── Feed source CRUD ─────────────────────────────────────────────────────────

/**
 * Process the delete feed.
 * @param userId - The r id.
 * @param sourceId - The source id.
 * @param deps - The deps.
 * @returns The delete feed.
 */
export async function deleteFeed(
  userId: number,
  sourceId: number,
  deps: Pick<FeedServiceDeps, "deleteFeedSourceForUserFn"> = {},
): Promise<FeedSourceRecord> {
  const deleteSource =
    deps.deleteFeedSourceForUserFn ?? deleteFeedSourceForUser;
  const deleted = await deleteSource(userId, sourceId);

  if (!deleted) throw new ServerServiceError("Feed source not found", 404);

  invalidateUserCache(userId);
  invalidateUserFeedSourceListCache(userId);
  return deleted;
}

/**
 * Return the category order.
 * @param userId - The r id.
 * @param deps - The deps.
 * @returns The category order.
 */
export async function getCategoryOrder(
  userId: number,
  deps: Pick<FeedServiceDeps, "getDbFn"> = {},
): Promise<string[]> {
  const db = (deps.getDbFn ?? getDb)();
  const rows = await db
    .select({ orderedLabels: categoryOrders.orderedLabels })
    .from(categoryOrders)
    .where(eq(categoryOrders.userId, userId))
    .limit(1);

  return rows.length === 0 ? [] : safeParseLabelArray(rows[0].orderedLabels);
}

/**
 * Process the rename feed.
 * @param userId - The r id.
 * @param sourceId - The source id.
 * @param name - The name.
 * @param url - The url.
 * @param deps - The deps.
 * @returns The rename feed.
 */
export async function renameFeed(
  userId: number,
  sourceId: number,
  name: string,
  url: string,
  deps: Pick<FeedServiceDeps, "renameFeedSourceForUserFn"> = {},
): Promise<FeedSourceRecord> {
  const rename = deps.renameFeedSourceForUserFn ?? renameFeedSourceForUser;
  const updated = await rename(userId, sourceId, name, url);
  if (!updated) throw new ServerServiceError("Feed source not found", 404);

  invalidateUserCache(userId);
  invalidateUserFeedSourceListCache(userId);
  return updated;
}

/**
 * Process the save category order.
 * @param userId - The r id.
 * @param labels - The labels.
 * @param deps - The deps.
 * @returns The save category order.
 */
export async function saveCategoryOrder(
  userId: number,
  labels: string[],
  deps: Pick<FeedServiceDeps, "getDbFn"> = {},
): Promise<string[]> {
  const db = (deps.getDbFn ?? getDb)();
  const serialized = JSON.stringify(labels);
  await db
    .insert(categoryOrders)
    .values({
      orderedLabels: serialized,
      updatedAt: new Date(),
      userId,
    })
    .onConflictDoUpdate({
      set: { orderedLabels: serialized, updatedAt: new Date() },
      target: categoryOrders.userId,
    });
  return labels;
}
/**
 * Process the set feed enabled.
 * @param userId - The r id.
 * @param sourceId - The source id.
 * @param enabled - The enabled.
 * @param deps - The deps.
 * @returns The set feed enabled.
 */
export async function setFeedEnabled(
  userId: number,
  sourceId: number,
  enabled: boolean,
  deps: Pick<FeedServiceDeps, "setFeedSourceEnabledForUserFn"> = {},
): Promise<FeedSourceRecord> {
  const setEnabled =
    deps.setFeedSourceEnabledForUserFn ?? setFeedSourceEnabledForUser;
  const updated = await setEnabled(userId, sourceId, enabled);
  if (!updated) throw new ServerServiceError("Feed source not found", 404);

  invalidateUserCache(userId);
  invalidateUserFeedSourceListCache(userId);
  return updated;
}

/**
 * Update the feed settings.
 * @param userId - The r id.
 * @param sourceId - The source id.
 * @param settings - The settings.
 * @param deps - The deps.
 * @returns The feed settings.
 */
export async function updateFeedSettings(
  userId: number,
  sourceId: number,
  settings: FeedSettingsSettings,
  deps: Pick<FeedServiceDeps, "updateFeedSettingsForUserFn"> = {},
): Promise<FeedSourceRecord> {
  const update = deps.updateFeedSettingsForUserFn ?? updateFeedSettingsForUser;
  const updated = await update(userId, sourceId, settings);
  if (!updated) throw new ServerServiceError("Feed source not found", 404);

  invalidateUserCache(userId);
  invalidateUserFeedSourceListCache(userId);
  return updated;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Process the safe parse label array.
 * @param raw - The raw.
 * @returns The safe parse label array.
 */
function safeParseLabelArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
