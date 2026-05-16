/**
 * Built-in heuristic distillation strategy.
 *
 * Scores article-shaped containers first so prose-dense body sections beat
 * noisy whole-page wrappers, then falls back to deterministic selector matches
 * for tiny or structurally unusual pages. Title and description are extracted
 * from page metadata.
 */

import { parsePageTitle, readMetaTagContent } from "@/lib/sanitize";

import type { DistilledArticle, DistillOptions } from "./types";

import { findArticleBody } from "./body-selection";
import { findConfidentArticleBody } from "./confidence-selection";

const DEFAULT_MIN_BODY_LENGTH = 100;

/**
 * Distills an article page using the built-in HTML heuristic strategy.
 *
 * Selects the most credible article body by scoring candidate containers, falls
 * back to deterministic selectors for edge cases, and extracts title and
 * description from `<meta>` tags.
 *
 * @param html - Pre-cleaned or raw page HTML to distill.
 * @param url - Canonical article URL preserved on the returned result.
 * @param options - Optional distillation thresholds and strategy overrides.
 * @returns Distilled article content and metadata, or `null` when no body meets the credibility threshold.
 */
export function heuristicDistill(
  html: string,
  url: string,
  options?: DistillOptions,
): DistilledArticle | null {
  const threshold = options?.contentLengthThreshold ?? DEFAULT_MIN_BODY_LENGTH;

  const body =
    findConfidentArticleBody(html, threshold) ??
    findArticleBody(html, threshold);
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
