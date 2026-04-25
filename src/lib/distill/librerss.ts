/**
 * Librerss distillation strategy — built-in heuristic body selection.
 *
 * Finds the article body container via semantic selectors and common CMS
 * class patterns, then extracts title and description from meta tags.
 */

import { parsePageTitle, readMetaTagContent } from "@/lib/sanitize";

import type { DistilledArticle, DistillOptions } from "./types";

import { findArticleBody } from "./body-selection";

const DEFAULT_MIN_BODY_LENGTH = 100;

/**
 * Process the librerss distill.
 * @param html - The html.
 * @param url - The url.
 * @param options - The options used to process the librerss distill.
 * @returns The librerss distill.
 */
export function librerssDistill(
  html: string,
  url: string,
  options?: DistillOptions,
): DistilledArticle | null {
  const threshold = options?.contentLengthThreshold ?? DEFAULT_MIN_BODY_LENGTH;

  const body = findArticleBody(html, threshold);
  if (!body) return null;

  const title = parsePageTitle(html);
  const description =
    readMetaTagContent(html, [
      "og:description",
      "twitter:description",
      "description",
    ]) || undefined;

  return { content: body, description, source: url, title: title ?? undefined };
}
