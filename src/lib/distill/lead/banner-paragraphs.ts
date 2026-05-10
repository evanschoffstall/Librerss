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

/** Utility-state words that commonly cluster inside service banners. */
const UTILITY_STATE_TOKENS = new Set([
  "account",
  "cookie",
  "cookies",
  "notice",
  "official",
  "portal",
  "privacy",
  "secure",
  "security",
  "sensitive",
  "settings",
  "share",
  "sharing",
  "website",
  "websites",
]);

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
  const utilityStateHits = words.filter((word) =>
    UTILITY_STATE_TOKENS.has(word),
  ).length;
  const startsWithUtilityVerb =
    /^(?:accept|allow|click|learn|read|review|share|sign|use|view|visit)\b/.test(
      normalized,
    );
  if (utilityStateHits >= 4 || tokenHits >= 5) {
    return true;
  }

  if (hasUtilityVerbLead(startsWithUtilityVerb, utilityStateHits)) {
    return true;
  }

  return hasUtilityNoticeLead(words, tokenHits);
}

/**
 * Detects notice-style banner leads that begin with a utility framing token.
 * @param words - Normalized paragraph words.
 * @param tokenHits - Total count of utility tokens in the paragraph.
 * @returns Whether the paragraph begins like a notice banner.
 */
function hasUtilityNoticeLead(words: string[], tokenHits: number): boolean {
  const firstWord = words[0];
  return (
    tokenHits >= 4 &&
    (firstWord === "notice" ||
      firstWord === "official" ||
      firstWord === "secure")
  );
}

/**
 * Detects action-led service prompts such as privacy or security instructions.
 * @param startsWithUtilityVerb - Whether the paragraph opens with a utility verb.
 * @param utilityStateHits - Count of utility-state tokens in the paragraph.
 * @returns Whether the paragraph looks like a service instruction prompt.
 */
function hasUtilityVerbLead(
  startsWithUtilityVerb: boolean,
  utilityStateHits: number,
): boolean {
  return startsWithUtilityVerb && utilityStateHits >= 3;
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
