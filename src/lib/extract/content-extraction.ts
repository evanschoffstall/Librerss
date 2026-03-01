/**
 * Article content extraction — orchestrates body selection and metadata
 * reading from pre-cleaned HTML, returning a typed extraction result.
 *
 * HTML parsing lives in `@/lib/sanitize` (body-selection, metadata-extraction).
 * This module is pure orchestration + typed payload construction.
 */

import { logger } from "@/lib/logger";
import {
  extractPageTitle,
  findArticleBody,
  readMetaTagContent,
} from "@/lib/sanitize";

function contentPreview(s: string, max = 200): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

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
  logger.info(`[extract] findArticleBody start`, {
    inputChars: html.length,
    threshold,
  });

  const body = findArticleBody(html, threshold);
  if (!body) {
    logger.info(
      `[extract] findArticleBody returned null — no suitable container found`,
      {
        inputChars: html.length,
      },
    );
    return null;
  }

  logger.info(`[extract] findArticleBody matched`, {
    bodyChars: body.length,
    bodyPreview: contentPreview(body),
  });

  const title = extractPageTitle(html);
  const description =
    readMetaTagContent(html, [
      "og:description",
      "twitter:description",
      "description",
    ]) || undefined;

  logger.info(`[extract] extractArticleFromHtml result`, {
    bodyChars: body.length,
    title: title ?? null,
    descriptionChars: description?.length ?? 0,
  });

  return { content: body, title: title ?? undefined, description, source: url };
}
