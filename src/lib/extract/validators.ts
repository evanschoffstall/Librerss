import { jsonError } from "@/lib/api/http";
import { isAllowedFeedUrl, PUBLIC_FEED_URL_ERROR } from "@/lib/core";
import { stripUrlFragment } from "@/lib/utils";

/** Dep-injection seam — allows tests to swap SSRF validator and error factory. */
interface ParseArticleUrlDeps {
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  jsonErrorFn?: typeof jsonError;
}

/**
 * Validates a raw article URL string for the extract pipeline:
 *  1. Blank → 400
 *  2. SSRF-blocked or non-public host → 400
 *  3. Strips fragment (RFC 3986 §3.5) before any outbound request.
 *
 * Takes the URL string directly so callers avoid re-serialising and
 * re-parsing an already-parsed request body.
 * @param rawUrl
 * @param deps
 */
export async function parseAndValidateArticleUrl(
  rawUrl: string,
  deps?: ParseArticleUrlDeps,
): Promise<Response | string> {
  const isAllowedUrl = deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  const toJsonError = deps?.jsonErrorFn ?? jsonError;

  const articleUrl = rawUrl.trim();
  if (!articleUrl) return toJsonError("Article URL is required", 400);
  if (!(await isAllowedUrl(articleUrl)))
    return toJsonError(PUBLIC_FEED_URL_ERROR, 400);

  // Strip the URL fragment before making any upstream request (RFC 3986 §3.5).
  return stripUrlFragment(articleUrl);
}
