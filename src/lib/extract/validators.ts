import { jsonError } from "@/lib/api/http";
import { isAllowedFeedUrl, PUBLIC_FEED_URL_ERROR } from "@/lib/core";
import { stripUrlFragment } from "@/lib/utils";

/** Dep-injection seam — allows tests to swap SSRF validator and error factory. */
interface ParseArticleUrlDeps {
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  jsonErrorFn?: typeof jsonError;
}

/**
 * Parse the and validate article url.
 * @param rawUrl - The raw url.
 * @param deps - The deps.
 * @returns The and validate article url.
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
