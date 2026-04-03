import type { Article } from "@/lib/core/types";

import { parseDateOrNull } from "@/lib/utils/dates";

// ── Response builders ─────────────────────────────────────────────────────────

export interface BatchFeedResponseItem {
  articles: Article[];
  error?: string;
  lastFetchedAt?: Date;
  ok: boolean;
  unchanged?: boolean;
  url: string;
}

export function ensureArrayResponse<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw new Error("Invalid response format");
  return data as T[];
}

export function forbiddenResponse(message = "Forbidden"): Response {
  return jsonError(message, 403);
}

export function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export function jsonErrorWithReason(
  error: string,
  status: number,
  reason?: string,
): Response {
  return Response.json({ error, ...(reason && { reason }) }, { status });
}

// ── Response normalizers ──────────────────────────────────────────────────────

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
