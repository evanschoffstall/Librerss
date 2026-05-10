/**
 * Librerss distillation strategy — built-in heuristic body selection.
 *
 * Scores article-shaped containers first so prose-dense body sections can beat
 * noisy whole-page wrappers, then falls back to deterministic selector matches
 * for tiny or unusual pages. Title and description come from page metadata.
 */

import { parsePageTitle, readMetaTagContent } from "@/lib/sanitize";

import type { DistilledArticle, DistillOptions } from "./types";

import { findArticleBody } from "./body-selection";
import { findConfidentArticleBody } from "./confidence-selection";

const DEFAULT_MIN_BODY_LENGTH = 100;

/**
 * Distills a page with Librerss' built-in HTML heuristics.
 * @param html - Pre-cleaned or raw page HTML to distill.
 * @param url - Canonical article URL to preserve on the distilled result.
 * @param options - Optional distillation thresholds and strategy settings.
 * @returns Distilled article content and metadata, or null when no body is credible.
 */
export function librerssDistill(
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
