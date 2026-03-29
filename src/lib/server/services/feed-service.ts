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
} from "@/lib/api/feeds/types";

import {
  createOrUpdateFeedSource,
  deleteFeedSourceForUser,
  renameFeedSourceForUser,
  setFeedSourceEnabledForUser,
  updateFeedSettingsForUser,
} from "@/lib/api/feeds/repository";
import {
  invalidateUserCache,
  invalidateUserFeedSourceListCache,
} from "@/lib/core/feed-cache";
import { getDb } from "@/lib/db/db";
import { categoryOrders } from "@/lib/db/schema";

import { ServerServiceError } from "./errors";

export interface FeedServiceDeps {
  createOrUpdateFeedSourceFn?: typeof createOrUpdateFeedSource;
  deleteFeedSourceForUserFn?: typeof deleteFeedSourceForUser;
  getDbFn?: typeof getDb;
  renameFeedSourceForUserFn?: typeof renameFeedSourceForUser;
  setFeedSourceEnabledForUserFn?: typeof setFeedSourceEnabledForUser;
  updateFeedSettingsForUserFn?: typeof updateFeedSettingsForUser;
}

// ─── Feed source listing ──────────────────────────────────────────────────────

export async function createFeed(
  userId: number,
  payload: CreateFeedPayload,
  deps: Pick<
    FeedServiceDeps,
    "createOrUpdateFeedSourceFn" | "getDbFn"
  > = {},
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

// ─── Feed source CRUD ─────────────────────────────────────────────────────────

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

  return rows.length === 0
    ? []
    : safeParseLabelArray(rows[0].orderedLabels);
}

export async function renameFeed(
  userId: number,
  sourceId: number,
  name: string,
  url: string,
  deps: Pick<FeedServiceDeps, "renameFeedSourceForUserFn"> = {},
): Promise<FeedSourceRecord> {
  const rename =
    deps.renameFeedSourceForUserFn ?? renameFeedSourceForUser;
  const updated = await rename(userId, sourceId, name, url);
  if (!updated) throw new ServerServiceError("Feed source not found", 404);

  invalidateUserCache(userId);
  invalidateUserFeedSourceListCache(userId);
  return updated;
}

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

export async function updateFeedSettings(
  userId: number,
  sourceId: number,
  settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
  deps: Pick<FeedServiceDeps, "updateFeedSettingsForUserFn"> = {},
): Promise<FeedSourceRecord> {
  const update =
    deps.updateFeedSettingsForUserFn ?? updateFeedSettingsForUser;
  const updated = await update(userId, sourceId, settings);
  if (!updated) throw new ServerServiceError("Feed source not found", 404);

  invalidateUserCache(userId);
  invalidateUserFeedSourceListCache(userId);
  return updated;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function safeParseLabelArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string",
    );
  } catch {
    return [];
  }
}
