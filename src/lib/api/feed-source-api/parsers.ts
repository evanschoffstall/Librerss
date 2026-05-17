import type { NextRequest } from "next/server";

import { CONFIG } from "@/lib";
import {
  asTrimmedString,
  jsonError,
  parseJsonObjectBodyOrResponse,
  parsePositiveInt,
} from "@/lib/api/http";
import {
  isAllowedFeedUrl,
  PUBLIC_FEED_URL_ERROR,
} from "@/lib/core/feed-url-validator";
import { DEFAULT_CATEGORY_LABEL, normalizeCategory } from "@/lib/utils";

import type {
  CreateFeedPayload,
  RenameFeedPayload,
  ToggleFeedEnabledPayload,
  UpdateFeedSettingsPayload,
} from "./types";

// de-facto safe upper bound for stored URLs (RFC 2616 §3.2.1 guideline)
const MAX_FEED_URL_LENGTH = 2048;

/**
 * Validate that the given URL is allowed to be added as a feed source.
 * @param url - The URL to validate.
 * @returns `null` if the URL is permitted, or a 400 error response if it is blocked.
 */
export async function assertAllowedFeedUrl(
  url: string,
): Promise<null | Response> {
  if (await isAllowedFeedUrl(url)) {
    return null;
  }

  return jsonError(PUBLIC_FEED_URL_ERROR, 400);
}

/**
 * Extract the `url` query parameter from the request URL.
 * @param request - The incoming Next.js request.
 * @returns The trimmed URL string, or `null` if the parameter is absent or empty.
 */
export function getRequestedFeedUrl(request: NextRequest): null | string {
  const requestUrl = new URL(request.url);
  const requestedUrl = requestUrl.searchParams.get("url");
  if (requestedUrl === null) {
    return null;
  }

  const trimmedUrl = requestedUrl.trim();
  return trimmedUrl === "" ? null : trimmedUrl;
}

/**
 * Parse and validate the create-feed request body.
 * @param request - The incoming Next.js request.
 * @returns The validated {@link CreateFeedPayload}, or a 400 error response if the body is invalid.
 */
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

/**
 * Extract and validate the feed source ID from the request's `id` query parameter.
 * @param request - The incoming Next.js request.
 * @returns The positive integer source ID, or a 400 error response if the parameter is missing or invalid.
 */
export function parseDeleteSourceId(request: NextRequest): number | Response {
  const requestUrl = new URL(request.url);
  const sourceId = parsePositiveInt(requestUrl.searchParams.get("id"));

  if (!sourceId) {
    return jsonError("A valid id query parameter is required", 400);
  }

  return sourceId;
}

/**
 * Parse and validate the rename-feed request body.
 * @param request - The incoming Next.js request.
 * @returns The validated {@link RenameFeedPayload}, or a 400 error response if the body is invalid.
 */
export async function parseRenameFeedPayload(
  request: NextRequest,
): Promise<RenameFeedPayload | Response> {
  const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
  if (payloadOrResponse instanceof Response) {
    return payloadOrResponse;
  }

  return parseRenameFeedPayloadFromBody(payloadOrResponse);
}

/**
 * Validate a pre-parsed rename-feed request body object.
 * @param payload - The raw JSON object extracted from the request body.
 * @returns The validated {@link RenameFeedPayload}, or a 400 error response if any field is invalid.
 */
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

/**
 * Validate a pre-parsed toggle-feed-enabled request body object.
 * @param payload - The raw JSON object extracted from the request body.
 * @returns The validated {@link ToggleFeedEnabledPayload}, or a 400 error response if any field is invalid.
 */
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

/**
 * Validate a pre-parsed update-feed-settings request body object.
 * @param payload - The raw JSON object extracted from the request body.
 * @returns The validated {@link UpdateFeedSettingsPayload}, or a 400 error response if any field is invalid.
 */
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
