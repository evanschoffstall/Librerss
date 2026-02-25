import { DEFAULT_CATEGORY_LABEL, normalizeCategory } from "@/lib";
import {
  asTrimmedString,
  parseJsonBodyOrResponse,
  parsePositiveInt,
} from "@/lib/api/request";
import { jsonError } from "@/lib/api/responses";
import { CONFIG } from "@/lib/config";
import {
  isAllowedFeedUrl,
  PUBLIC_FEED_URL_ERROR,
} from "@/lib/core/feed-fetcher";
import type { NextRequest } from "next/server";
import type { CreateFeedPayload, RenameFeedPayload } from "../types";

export async function assertAllowedFeedUrl(
  url: string,
): Promise<Response | null> {
  if (await isAllowedFeedUrl(url)) {
    return null;
  }

  return jsonError(PUBLIC_FEED_URL_ERROR, 400);
}

export async function parseCreateFeedPayload(
  request: NextRequest,
): Promise<CreateFeedPayload | Response> {
  const payloadOrResponse =
    await parseJsonBodyOrResponse<Record<string, unknown>>(request);
  if (payloadOrResponse instanceof Response) {
    return payloadOrResponse;
  }

  const payload = payloadOrResponse;
  const name = asTrimmedString(payload.name);
  const url = asTrimmedString(payload.url);
  const category =
    typeof payload.category === "string" && payload.category.trim()
      ? normalizeCategory(payload.category)
      : DEFAULT_CATEGORY_LABEL;

  if (!name || !url) {
    return jsonError("Both name and url are required", 400);
  }

  if (
    name.length > CONFIG.MAX_FEED_NAME_LENGTH ||
    category.length > CONFIG.MAX_CATEGORY_NAME_LENGTH
  ) {
    return jsonError(
      `name and category must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less`,
      400,
    );
  }

  return { name, url, category };
}

export async function parseRenameFeedPayload(
  request: NextRequest,
): Promise<RenameFeedPayload | Response> {
  const payloadOrResponse =
    await parseJsonBodyOrResponse<Record<string, unknown>>(request);
  if (payloadOrResponse instanceof Response) {
    return payloadOrResponse;
  }

  const payload = payloadOrResponse;
  const sourceId = parsePositiveInt(payload.id);
  const name = asTrimmedString(payload.name);
  const url = asTrimmedString(payload.url);

  if (!sourceId) {
    return jsonError("A valid id is required", 400);
  }

  if (!name) {
    return jsonError("name is required", 400);
  }

  if (!url) {
    return jsonError("url is required", 400);
  }

  if (name.length > CONFIG.MAX_FEED_NAME_LENGTH) {
    return jsonError(
      `name must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less`,
      400,
    );
  }

  return { sourceId, name, url };
}

export function parseDeleteSourceId(request: NextRequest): number | Response {
  const requestUrl = new URL(request.url);
  const sourceId = parsePositiveInt(requestUrl.searchParams.get("id"));

  if (!sourceId) {
    return jsonError("A valid id query parameter is required", 400);
  }

  return sourceId;
}

export function getRequestedFeedUrl(request: NextRequest): string | null {
  const requestUrl = new URL(request.url);
  return requestUrl.searchParams.get("url")?.trim() || null;
}
