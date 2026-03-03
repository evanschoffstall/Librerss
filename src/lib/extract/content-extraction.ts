/**
 * Article content extraction — orchestrates body selection and metadata
 * reading from pre-cleaned HTML, returning a typed extraction result.
 *
 * HTML parsing lives in `@/lib/sanitize` (body-selection, metadata-extraction).
 * This module is pure orchestration + typed payload construction.
 */

import {
  extractPageTitle,
  findArticleBody,
  readMetaTagContent,
} from "@/lib/sanitize";

export interface ExtractedArticle {
  content: string;
  title?: string;
  description?: string;
  source?: string;
}

interface ExtractOptions {
  contentLengthThreshold?: number;
}

const DEFAULT_MIN_BODY_LENGTH = 100;

/**
 * Extract article content from pre-cleaned HTML using built-in heuristics.
 *
 * Finds the article body container via semantic selectors and common CMS
 * class patterns. Extracts title and description from meta tags.
 * Returns null when no suitable container is found — the caller should
 * fall through to direct sanitization of the full page.
 */
export async function extractArticleFromHtml(
  html: string,
  url: string,
  options?: ExtractOptions,
): Promise<ExtractedArticle | null> {
  const threshold = options?.contentLengthThreshold ?? DEFAULT_MIN_BODY_LENGTH;

  const body = findArticleBody(html, threshold);
  if (!body) return null;

  const title = extractPageTitle(html);
  const description =
    readMetaTagContent(html, [
      "og:description",
      "twitter:description",
      "description",
    ]) || undefined;

  return { content: body, title: title ?? undefined, description, source: url };
}
