/** Generic utility words that identify service banners rather than lead prose. */
const UTILITY_LEAD_TOKENS = new Set([
  "account",
  "browser",
  "cookie",
  "cookies",
  "information",
  "link",
  "notice",
  "official",
  "portal",
  "privacy",
  "secure",
  "security",
  "sensitive",
  "service",
  "services",
  "settings",
  "share",
  "sharing",
  "site",
  "sites",
  "tab",
  "website",
  "websites",
  "window",
]);

/** Multi-word notice patterns that commonly appear in utility banners. */
const UTILITY_LEAD_PHRASES = [
  "account settings",
  "cookie settings",
  "learn more",
  "official website",
  "privacy settings",
  "secure website",
  "share sensitive information",
  "site is secure",
] as const;

/**
 * Counts banner-like utility paragraphs inside a candidate wrapper so broad
 * page shells lose confidence against the real article body.
 * @param html - Candidate container HTML to inspect.
 * @param createVisibleText - Visible-text projector used by the confidence scorer.
 * @returns Number of paragraphs that read like site utility notices.
 */
export function countUtilityLeadParagraphs(
  html: string,
  createVisibleText: (html: string) => string,
): number {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].filter((paragraph) =>
    isLikelyUtilityLeadParagraph(createVisibleText(paragraph[1])),
  ).length;
}

/**
 * Detects utility and notice paragraphs that should not qualify as article
 * lead prose. This uses generic service and chrome signals instead of
 * source-specific banner copy.
 * @param text - Visible paragraph text preceding or surrounding article content.
 * @returns Whether the paragraph reads like utility chrome rather than article prose.
 */
export function isLikelyUtilityLeadParagraph(text: string): boolean {
  const normalized = normalizeHeuristicText(text);
  if (!normalized) return false;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 8 || words.length > 48) {
    return false;
  }

  const tokenHits = words.filter((word) =>
    UTILITY_LEAD_TOKENS.has(word),
  ).length;
  const phraseHits = UTILITY_LEAD_PHRASES.filter((phrase) =>
    normalized.includes(phrase),
  ).length;
  const startsWithUtilityVerb =
    /^(?:accept|allow|click|learn|read|review|share|sign|use|view|visit)\b/.test(
      normalized,
    );

  return (
    phraseHits >= 2 ||
    tokenHits >= 5 ||
    (startsWithUtilityVerb && tokenHits >= 3)
  );
}

/**
 * Normalizes prose fragments so generic heuristic matching stays insensitive to
 * punctuation and publisher casing differences.
 * @param value - Visible paragraph text extracted from a candidate container.
 * @returns Lowercase normalized text with stable internal spacing.
 */
function normalizeHeuristicText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
