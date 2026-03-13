/**
 * Custom distillation strategy — built-in heuristic body selection.
 *
 * Finds the article body container via semantic selectors and common CMS
 * class patterns, then extracts title and description from meta tags.
 */

import { findArticleBody } from "./body-selection";
import type { DistilledArticle, DistillOptions } from "./types";

import { parsePageTitle, readMetaTagContent } from "@/lib/sanitize";

const DEFAULT_MIN_BODY_LENGTH = 100;

export function customDistill(
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
