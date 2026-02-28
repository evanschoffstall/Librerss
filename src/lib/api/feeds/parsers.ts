import {
  asTrimmedString,
  jsonError,
  parseJsonObjectBodyOrResponse,
  parsePositiveInt,
} from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import {
  isAllowedFeedUrl,
  PUBLIC_FEED_URL_ERROR,
} from "@/lib/core/feed-url-validator";
import {
  DEFAULT_CATEGORY_LABEL,
  normalizeCategory,
} from "@/lib/utils/categories";
import type { NextRequest } from "next/server";
import type {
  CreateFeedPayload,
  RenameFeedPayload,
  ToggleFeedEnabledPayload,
} from "./types";

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
  const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
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
      `name must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less; category must be ${CONFIG.MAX_CATEGORY_NAME_LENGTH} characters or less`,
      400,
    );
  }

  return { name, url, category };
}

export async function parseRenameFeedPayload(
  request: NextRequest,
): Promise<RenameFeedPayload | Response> {
  const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
  if (payloadOrResponse instanceof Response) {
    return payloadOrResponse;
  }

  return parseRenameFeedPayloadFromBody(payloadOrResponse);
}

export function parseRenameFeedPayloadFromBody(
  payload: Record<string, unknown>,
): RenameFeedPayload | Response {
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

export function parseToggleFeedEnabledPayloadFromBody(
  payload: Record<string, unknown>,
): ToggleFeedEnabledPayload | Response {
  const sourceId = parsePositiveInt(payload.id);
  if (!sourceId) {
    return jsonError("A valid id is required", 400);
  }

  if (typeof payload.enabled !== "boolean") {
    return jsonError("enabled must be a boolean", 400);
  }

  return { sourceId, enabled: payload.enabled };
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
