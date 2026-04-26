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
      ? (candidate.articles as Article[])
      : [],
    ok: Boolean(candidate.ok),
    ...(candidate.unchanged === true ? { unchanged: true } : {}),
    url: typeof candidate.url === "string" ? candidate.url : "",
    ...(typeof candidate.error === "string" ? { error: candidate.error } : {}),
    ...(parsedLastFetchedAt ? { lastFetchedAt: parsedLastFetchedAt } : {}),
  };
}
