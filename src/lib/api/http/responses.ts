import type { Article } from "@/lib/core/types";
import { parseDateOrNull } from "@/lib/utils/date-utils";
import { NextResponse } from "next/server";

// ── Response builders ─────────────────────────────────────────────────────────

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function forbiddenResponse(message = "Forbidden"): NextResponse {
  return jsonError(message, 403);
}

export function textResponse(body: string, status = 200): Response {
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function notFoundResponse(message = "Not found"): Response {
  return jsonError(message, 404);
}

// ── Response normalizers ──────────────────────────────────────────────────────

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
