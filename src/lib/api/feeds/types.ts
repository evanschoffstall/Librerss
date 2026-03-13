import { getDb } from "@/lib/db/db";

export interface CreateFeedPayload {
  category: string;
  name: string;
  url: string;
}

export interface CreateFeedSourceResult {
  isNew: boolean;
  sourceRecord: FeedSourceRecord;
}

export type FeedSourceListRow = FeedSourceRecord & {
  category: null | string;
};

export interface FeedSourceRecord {
  enabled?: boolean;
  extractionDisabled?: boolean;
  id: number;
  name: string;
  proxyEnabled?: boolean;
  url: string;
}

export type FeedTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

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
