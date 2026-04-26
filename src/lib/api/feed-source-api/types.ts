import type { FeedSourceListRow, FeedSourceRecord } from "@/lib/types";

/**
 * Describes the create feed payload.
 */
export interface CreateFeedPayload {
  category: string;
  name: string;
  url: string;
}

/**
 * Describes the create feed source result.
 */
export interface CreateFeedSourceResult {
  isNew: boolean;
  sourceRecord: FeedSourceRecord;
}

/**
 * Defines the feed transaction type.
 */
export type FeedTransaction = Parameters<
  Parameters<ReturnType<DbMod["getDb"]>["transaction"]>[0]
>[0];

export type { FeedSourceListRow, FeedSourceRecord };

/**
 * Describes the rename feed payload.
 */
export interface RenameFeedPayload {
  name: string;
  sourceId: number;
  url: string;
}

/**
 * Describes the toggle feed enabled payload.
 */
export interface ToggleFeedEnabledPayload {
  enabled: boolean;
  sourceId: number;
}

/**
 * Describes the update feed settings payload.
 */
export interface UpdateFeedSettingsPayload {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
  sourceId: number;
}

/**
 * Defines the DB mod type.
 */
type DbMod = typeof import("@/lib/db");
