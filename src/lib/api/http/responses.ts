import type { Article } from "@/lib/core";

import { parseDateOrNull } from "@/lib/utils";

// ── Response builders ─────────────────────────────────────────────────────────

/**
 * Describes the batch feed response item.
 */
export interface BatchFeedResponseItem {
  articles: Article[];
  error?: string;
  lastFetchedAt?: Date;
  ok: boolean;
  statusCode?: number;
  unchanged?: boolean;
  url: string;
}

/**
 * Process the ensure array response.
 * @param data - The data.
 * @returns The ensure array response.
 */
export function ensureArrayResponse<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw new Error("Invalid response format");
  return data as T[];
}

/**
 * Process the forbidden response.
 * @param message - The message.
 * @returns The forbidden response.
 */
export function forbiddenResponse(message = "Forbidden"): Response {
  return jsonError(message, 403);
}

/**
 * Process the json error.
 * @param error - The error.
 * @param status - The status.
 * @returns The json error.
 */
export function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

/**
 * Process the json error with reason.
 * @param error - The error.
 * @param status - The status.
 * @param reason - The reason.
 * @returns The json error with reason.
 */
export function jsonErrorWithReason(
  error: string,
  status: number,
  reason?: string,
): Response {
  return Response.json({ error, ...(reason && { reason }) }, { status });
}

// ── Response normalizers ──────────────────────────────────────────────────────

/**
 * Normalize the batch item.
 * @param item - The item.
 * @returns The batch item.
 */
export function normalizeBatchItem(item: unknown): BatchFeedResponseItem {
  const candidate =
    item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const parsedLastFetchedAt = parseDateOrNull(candidate.lastFetchedAt);

  return {
    articles: Array.isArray(candidate.articles)
      ? candidate.articles.map((article) => normalizeArticleResponse(article))
      : [],
    ok: Boolean(candidate.ok),
    ...(typeof candidate.statusCode === "number" &&
    Number.isFinite(candidate.statusCode)
      ? { statusCode: candidate.statusCode }
      : {}),
    ...(candidate.unchanged === true ? { unchanged: true } : {}),
    url: typeof candidate.url === "string" ? candidate.url : "",
    ...(typeof candidate.error === "string" ? { error: candidate.error } : {}),
    ...(parsedLastFetchedAt ? { lastFetchedAt: parsedLastFetchedAt } : {}),
  };
}

/**
 * Normalize article fields that lose their runtime type while crossing the JSON
 * boundary. Keeping the response object close to the `Article` contract avoids
 * every dashboard consumer having to defensively parse timestamps on read.
 * @param article - The raw article payload from the batch response.
 * @returns The article with parseable timestamp fields restored to `Date` objects.
 */
function normalizeArticleResponse(article: unknown): Article {
  if (!article || typeof article !== "object") {
    return article as Article;
  }

  const articleRecord = article as Article & Record<string, unknown>;
  const parsedLastChecked = parseDateOrNull(articleRecord.lastChecked);
  const parsedPublicationDate = parseDateOrNull(articleRecord.publicationDate);

  return {
    ...articleRecord,
    ...(parsedLastChecked ? { lastChecked: parsedLastChecked } : {}),
    ...(parsedPublicationDate
      ? { publicationDate: parsedPublicationDate }
      : {}),
  };
}
