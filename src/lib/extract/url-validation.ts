import { jsonError, parseJsonBodyOrResponse } from "@/lib/api/http";
import {
  isAllowedFeedUrl,
  PUBLIC_FEED_URL_ERROR,
} from "@/lib/core/feed-url-validator";
import { stripUrlFragment } from "@/lib/utils/url";
import { NextRequest } from "next/server";

type ParseArticleUrlDeps = {
  parseJsonBodyOrResponseFn?: typeof parseJsonBodyOrResponse;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  jsonErrorFn?: typeof jsonError;
};

export async function parseAndValidateArticleUrl(
  request: NextRequest,
  deps?: ParseArticleUrlDeps,
): Promise<string | Response> {
  const parseJson = deps?.parseJsonBodyOrResponseFn ?? parseJsonBodyOrResponse;
  const isAllowedUrl = deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  const toJsonError = deps?.jsonErrorFn ?? jsonError;

  const payloadOrResponse = await parseJson<{ url?: string }>(request);
  if (payloadOrResponse instanceof Response) return payloadOrResponse;

  const articleUrl = payloadOrResponse.url?.trim() ?? "";
  if (!articleUrl) return toJsonError("Article URL is required", 400);
  if (!(await isAllowedUrl(articleUrl)))
    return toJsonError(PUBLIC_FEED_URL_ERROR, 400);

  // Strip the URL fragment before making any upstream request (RFC 3986 §3.5).
  return stripUrlFragment(articleUrl);
}
