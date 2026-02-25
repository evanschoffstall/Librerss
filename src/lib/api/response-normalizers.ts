import type { Article } from "../core/types";
import { parseDateOrNull } from "../utils/date-utils";

export function ensureArrayResponse<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw new Error("Invalid response format");
  return data as T[];
}

export interface BatchFeedResponseItem {
  url: string;
  articles: Article[];
  ok: boolean;
  error?: string;
  lastFetchedAt?: Date;
}

function parseLastFetchedAt(value: unknown): Date | null {
  return parseDateOrNull(value);
}

export function normalizeBatchItem(item: unknown): BatchFeedResponseItem {
  const candidate =
    item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const parsedLastFetchedAt = parseLastFetchedAt(candidate.lastFetchedAt);

  return {
    url: typeof candidate.url === "string" ? candidate.url : "",
    articles: Array.isArray(candidate.articles)
      ? (candidate.articles as Article[])
      : [],
    ok: Boolean(candidate.ok),
    ...(typeof candidate.error === "string" ? { error: candidate.error } : {}),
    ...(parsedLastFetchedAt ? { lastFetchedAt: parsedLastFetchedAt } : {}),
  };
}
