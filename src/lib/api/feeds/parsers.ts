import type { NextRequest } from "next/server";

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

import type {
  CreateFeedPayload,
  RenameFeedPayload,
  ToggleFeedEnabledPayload,
  UpdateFeedSettingsPayload,
} from "./types";

// de-facto safe upper bound for stored URLs (RFC 2616 §3.2.1 guideline)
const MAX_FEED_URL_LENGTH = 2048;

export async function assertAllowedFeedUrl(
  url: string,
): Promise<null | Response> {
  if (await isAllowedFeedUrl(url)) {
    return null;
  }

  return jsonError(PUBLIC_FEED_URL_ERROR, 400);
}

export function getRequestedFeedUrl(request: NextRequest): null | string {
  const requestUrl = new URL(request.url);
  const requestedUrl = requestUrl.searchParams.get("url");
  if (requestedUrl === null) {
    return null;
  }

  const trimmedUrl = requestedUrl.trim();
  return trimmedUrl === "" ? null : trimmedUrl;
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

  if (url.length > MAX_FEED_URL_LENGTH) {
    return jsonError(
      `url must be ${MAX_FEED_URL_LENGTH} characters or less`,
      400,
    );
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

  return { category, name, url };
}

export function parseDeleteSourceId(request: NextRequest): number | Response {
  const requestUrl = new URL(request.url);
  const sourceId = parsePositiveInt(requestUrl.searchParams.get("id"));

  if (!sourceId) {
    return jsonError("A valid id query parameter is required", 400);
  }

  return sourceId;
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

  if (url.length > MAX_FEED_URL_LENGTH) {
    return jsonError(
      `url must be ${MAX_FEED_URL_LENGTH} characters or less`,
      400,
    );
  }

  if (name.length > CONFIG.MAX_FEED_NAME_LENGTH) {
    return jsonError(
      `name must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less`,
      400,
    );
  }

  return { name, sourceId, url };
}

export function parseToggleFeedEnabledPayloadFromBody(
  payload: Record<string, unknown>,
): Response | ToggleFeedEnabledPayload {
  const sourceId = parsePositiveInt(payload.id);
  if (!sourceId) {
    return jsonError("A valid id is required", 400);
  }

  if (typeof payload.enabled !== "boolean") {
    return jsonError("enabled must be a boolean", 400);
  }

  return { enabled: payload.enabled, sourceId };
}

export function parseUpdateFeedSettingsPayloadFromBody(
  payload: Record<string, unknown>,
): Response | UpdateFeedSettingsPayload {
  const sourceId = parsePositiveInt(payload.id);
  if (!sourceId) return jsonError("A valid id is required", 400);

  const hasExtraction = typeof payload.extractionDisabled === "boolean";
  const hasProxy = typeof payload.proxyEnabled === "boolean";
  if (!hasExtraction && !hasProxy)
    return jsonError(
      "At least one of extractionDisabled or proxyEnabled is required",
      400,
    );

  return {
    sourceId,
    ...(hasExtraction && {
      extractionDisabled: payload.extractionDisabled as boolean,
    }),
    ...(hasProxy && { proxyEnabled: payload.proxyEnabled as boolean }),
  };
}
