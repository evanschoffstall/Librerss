import type { FeedSourceListRow, FeedSourceRecord } from "@/lib/types";

export interface CreateFeedPayload {
  category: string;
  name: string;
  url: string;
}

export interface CreateFeedSourceResult {
  isNew: boolean;
  sourceRecord: FeedSourceRecord;
}

export type FeedTransaction = Parameters<
  Parameters<ReturnType<DbMod["getDb"]>["transaction"]>[0]
>[0];

export type { FeedSourceListRow, FeedSourceRecord };

export interface RenameFeedPayload {
  name: string;
  sourceId: number;
  url: string;
}

export interface ToggleFeedEnabledPayload {
  enabled: boolean;
  sourceId: number;
}

export interface UpdateFeedSettingsPayload {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
  sourceId: number;
}

type DbMod = typeof import("@/lib/db");
