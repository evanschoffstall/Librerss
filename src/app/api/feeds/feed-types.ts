import { getDb } from "@/lib/db/db";

export type FeedTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export type CreateFeedPayload = {
  name: string;
  url: string;
  category: string;
};

export type RenameFeedPayload = {
  sourceId: number;
  name: string;
};

export type FeedSourceRecord = {
  id: number;
  name: string;
  url: string;
};

export type FeedSourceListRow = FeedSourceRecord & {
  category: string | null;
};

export type CreateFeedSourceResult = {
  sourceRecord: FeedSourceRecord;
  isNew: boolean;
};
