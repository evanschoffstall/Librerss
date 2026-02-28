import { toPlainText } from "./sanitize";

export function stripCommentEngagementBoilerplate(content: string): string {
  return content
    .replace(/<p\b[^>]*>([^<]{0,300})<\/p>/gi, (match, text: string) => {
      const lower = text.toLowerCase();
      const hasLoginSignal =
        /(log\s*(?:in|out)|sign\s*(?:in|out)|display\s*name|before\s+commenting|to\s+comment|must\s+confirm|will\s+be\s+prompted)/.test(
          lower,
        );
      return hasLoginSignal ? "" : match;
    })
    .trim();
}

/**
 * Returns true when the sanitized content looks like site navigation or footer
 * boilerplate rather than an article body.  Detection is purely heuristic:
 * it requires at least 2 known site-chrome keyword markers ("privacy",
 * "advertise", "subscribe", etc.) AND a high link + list-item density.  All
 * three conditions must hold to avoid false positives on article content that
 * legitimately mentions those words.
 */
export function isLikelyNavFooterBoilerplate(content: string): boolean {
  const lower = content.toLowerCase();
  const markerHits = [
    "privacy",
    "terms",
    "subscribe",
    "masthead",
    "copyright",
    "© ",
    "newsletter",
    "advertise",
    "contact",
    "sitemap",
    "rules of the road",
  ].filter((m) => lower.includes(m)).length;

  const linkCount = (content.match(/<a\b/gi) ?? []).length;
  const listItemCount = (content.match(/<li\b/gi) ?? []).length;

  // Require all three signals to fire together to avoid false positives.
  return markerHits >= 2 && linkCount >= 6 && listItemCount >= 4;
}

/**
 * Returns true when the content appears to contain a real article body worth
 * showing to the user.  Two independent signals are tried in order:
 *
 * 1. Structural check — 2+ block-level elements (p, headings, blockquote, list)
 *    strongly suggest formatted article prose.
 * 2. Plain-text length check — ≥280 chars of prose (≈2 sentences) as a fallback
 *    for pages that use only inline markup with no block containers.
 *
 * Used by the direct-sanitize fallback to avoid promoting ad fragments or
 * empty boilerplate into the article slot.
 */
export function hasReadableArticleBody(content: string): boolean {
  // Prefer structured markup as the primary signal — fast and reliable.
  const blockElementCount = (
    content.match(/<(?:p|h[1-6]|blockquote|ul|ol)\b/gi) ?? []
  ).length;
  if (blockElementCount >= 2) return true;

  // Fall back to raw text length for pages with minimal HTML structure.
  const plainTextLength = toPlainText(content)
    .replace(/\s+/g, " ")
    .trim().length;
  return plainTextLength >= 280;
}

/**
 * Final clean-up pass applied to sanitized article HTML before it is stored
 * or returned to the client.  Two things are removed in sequence:
 *
 * 1. Comment-engagement boilerplate — login prompts, "before commenting"
 *    notices, etc. that extractors sometimes pull in from the comment section.
 * 2. Nav/footer boilerplate guard — if the whole remaining content still looks
 *    like site chrome (high link density + site-chrome keywords), discard it
 *    entirely so the caller can fall through to a better fallback.
 *
 * `_articleUrl` is reserved for future per-origin cleaning rules but is
 * intentionally unused today to keep the logic domain-agnostic.
 */
export function cleanExtractedArticleHtml(
  sanitizedContent: string,
  _articleUrl: string,
): string {
  if (!sanitizedContent.trim()) return "";

  const withoutEngagementPrompts =
    stripCommentEngagementBoilerplate(sanitizedContent);

  if (!withoutEngagementPrompts.trim()) return "";

  // Discard entirely if the content still looks like a nav/footer block.
  return isLikelyNavFooterBoilerplate(withoutEngagementPrompts)
    ? ""
    : withoutEngagementPrompts;
}
