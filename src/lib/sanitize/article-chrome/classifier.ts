/** Generic action verbs commonly used by promotional or utility callouts. */
const CTA_ACTION_TOKENS = new Set([
  "add",
  "consider",
  "discover",
  "explore",
  "follow",
  "get",
  "join",
  "learn",
  "read",
  "receive",
  "review",
  "sign",
  "start",
  "subscribe",
  "support",
  "view",
  "watch",
]);

/** Generic target nouns commonly used by promotional or utility callouts. */
const CTA_SUBJECT_TOKENS = new Set([
  "alert",
  "alerts",
  "article",
  "articles",
  "brief",
  "briefing",
  "briefings",
  "feed",
  "guide",
  "guides",
  "newsletter",
  "newsletters",
  "note",
  "notes",
  "post",
  "posts",
  "publication",
  "publications",
  "reader",
  "report",
  "reports",
  "sheet",
  "source",
  "sources",
  "subscriber",
  "subscribers",
  "subscription",
  "subscriptions",
  "update",
  "updates",
  "video",
  "videos",
]);

/** Generic utility-state tokens that identify setup or capability prompts. */
const CTA_UTILITY_STATE_TOKENS = new Set([
  "browser",
  "enabled",
  "javascript",
  "login",
  "settings",
  "support",
]);

/** Generic byline and metadata tokens that identify pre-body article chrome. */
const LEADING_METADATA_TOKENS = new Set([
  "author",
  "by",
  "contact",
  "date",
  "editor",
  "media",
  "posted",
  "published",
  "release",
  "updated",
]);

/** Generic media-widget heading tokens that describe utility UI rather than prose. */
const MEDIA_WIDGET_HEADING_TOKENS = new Set([
  "audio",
  "caption",
  "captions",
  "details",
  "file",
  "gallery",
  "image",
  "images",
  "media",
  "photo",
  "photos",
  "video",
  "videos",
]);

/** Generic heading tokens that commonly introduce trailing recommendation chrome. */
const TRAILING_CHROME_HEADING_TOKENS = new Set([
  "additional",
  "coverage",
  "further",
  "information",
  "latest",
  "more",
  "news",
  "read",
  "recent",
  "related",
  "resources",
  "stories",
  "story",
  "tags",
  "topics",
  "updates",
]);

/**
 * Normalized short text segment used by generic cleanup classifiers.
 */
interface NormalizedTextSegment {
  normalized: string;
  words: string[];
}

/**
 * Finds the earliest trailing chrome boundary introduced by a short related or
 * taxonomy heading whose tail is structurally card- or link-heavy.
 * @param content - Sanitized article HTML to inspect.
 * @returns The character index of the trailing chrome boundary, or null.
 */
export function findTrailingChromeBoundary(content: string): null | number {
  const headingMatches = [
    ...content.matchAll(/<h([2-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi),
  ];

  for (const match of headingMatches) {
    if (!isLikelyTrailingChromeHeading(toClassifierPlainText(match[2]))) {
      continue;
    }

    if (hasTrailingChromeStructure(content.slice(match.index))) {
      return match.index;
    }
  }

  return null;
}

/**
 * Detects whether the text before the first body paragraph is metadata chrome
 * rather than meaningful lead prose.
 * @param text - Visible text extracted from the pre-body chunk.
 * @returns Whether the chunk behaves like byline, date, or utility chrome.
 */
export function isLikelyLeadingChromeText(text: string): boolean {
  const { normalized, words } = normalizeTextSegment(text);
  if (!normalized || words.length > 96) {
    return false;
  }

  const metadataHits = countSignalHits(words, LEADING_METADATA_TOKENS);
  const sentenceCount = (text.match(/[.!?]/g) ?? []).length;
  const linkPrompt = isLikelyPromoCtaText(text);

  return (
    (metadataHits >= 2 && sentenceCount <= 1) ||
    (hasDateLikeSignal(normalized) && metadataHits >= 1) ||
    (linkPrompt && sentenceCount === 0)
  );
}

/**
 * Detects whether a short heading labels a media widget rather than article
 * prose.
 * @param text - Visible heading text from sanitized article HTML.
 * @returns Whether the heading should be stripped as media-widget chrome.
 */
export function isLikelyMediaWidgetHeadingText(text: string): boolean {
  const { words } = normalizeTextSegment(text);
  if (words.length === 0 || words.length > 4) {
    return false;
  }

  return countSignalHits(words, MEDIA_WIDGET_HEADING_TOKENS) >= 2;
}

/**
 * Detects whether a short visible text segment behaves like a promotional or
 * utility CTA rather than article prose.
 * @param text - Visible text extracted from a candidate CTA block.
 * @returns Whether the text looks like a promo or setup CTA.
 */
export function isLikelyPromoCtaText(text: string): boolean {
  const { normalized, words } = normalizeTextSegment(text);
  if (!normalized || words.length === 0 || words.length > 16) {
    return false;
  }

  const actionHits = countSignalHits(words, CTA_ACTION_TOKENS);
  const subjectHits = countSignalHits(words, CTA_SUBJECT_TOKENS);
  const utilityStateHits = countSignalHits(words, CTA_UTILITY_STATE_TOKENS);
  const startsWithAction = CTA_ACTION_TOKENS.has(words[0] ?? "");

  if (
    hasActionLedPromoSignal(startsWithAction, subjectHits, utilityStateHits)
  ) {
    return true;
  }

  if (hasSubjectHeavyPromoSignal(actionHits, subjectHits)) {
    return true;
  }

  return hasUtilityPromptPromoSignal(subjectHits, utilityStateHits);
}

/**
 * Counts how many normalized words belong to a given signal set.
 * @param words - Normalized word list to inspect.
 * @param signals - Signal words that increase classifier confidence.
 * @returns Number of words that matched the supplied signal set.
 */
function countSignalHits(
  words: string[],
  signals: ReadonlySet<string>,
): number {
  return words.filter((word) => signals.has(word)).length;
}

/**
 * Detects action-led CTA copy such as "read updates" or "join newsletter".
 * @param startsWithAction - Whether the text begins with a CTA verb.
 * @param subjectHits - Count of CTA subject words.
 * @param utilityStateHits - Count of utility prompt words.
 * @returns Whether the text behaves like an action-led CTA.
 */
function hasActionLedPromoSignal(
  startsWithAction: boolean,
  subjectHits: number,
  utilityStateHits: number,
): boolean {
  return startsWithAction && (subjectHits >= 1 || utilityStateHits >= 1);
}

/**
 * Detects whether a short text segment looks like a date, time stamp, or issue
 * metadata rather than article prose.
 * @param normalized - Lowercase normalized text segment.
 * @returns Whether the segment carries a date-like signal.
 */
function hasDateLikeSignal(normalized: string): boolean {
  return (
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/.test(
      normalized,
    ) ||
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      normalized,
    ) ||
    /\b\d{1,2}[/-]\d{1,2}\b/.test(normalized) ||
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(normalized) ||
    /\b\d{4}\b/.test(normalized)
  );
}

/**
 * Detects subject-heavy CTA copy that pairs one action with multiple marketing
 * or subscription targets.
 * @param actionHits - Count of CTA action words.
 * @param subjectHits - Count of CTA subject words.
 * @returns Whether the text behaves like a subject-heavy CTA.
 */
function hasSubjectHeavyPromoSignal(
  actionHits: number,
  subjectHits: number,
): boolean {
  return actionHits >= 1 && subjectHits >= 2;
}

/**
 * Detects whether the section after a candidate heading looks like related or
 * taxonomy chrome instead of continued article prose.
 * @param html - HTML that starts at a candidate trailing section heading.
 * @returns Whether the tail structure looks like recommendation chrome.
 */
function hasTrailingChromeStructure(html: string): boolean {
  const linkCount = (html.match(/<a\b/gi) ?? []).length;
  const imageCount = (html.match(/<img\b/gi) ?? []).length;
  const listCount = (html.match(/<(?:ul|ol)\b/gi) ?? []).length;
  const paragraphCount = (html.match(/<p\b/gi) ?? []).length;
  const headingMatches = [
    ...html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi),
  ].slice(1);
  const shortHeadingCount = headingMatches.filter(
    (match) =>
      normalizeTextSegment(toClassifierPlainText(match[2])).words.length <= 5,
  ).length;

  return (
    linkCount >= 2 &&
    (imageCount >= 1 || listCount >= 1 || shortHeadingCount >= 1) &&
    paragraphCount <= linkCount + 2
  );
}

/**
 * Detects setup prompts that combine multiple subscription nouns with a small
 * number of utility-state words.
 * @param subjectHits - Count of CTA subject words.
 * @param utilityStateHits - Count of utility prompt words.
 * @returns Whether the text behaves like a setup prompt CTA.
 */
function hasUtilityPromptPromoSignal(
  subjectHits: number,
  utilityStateHits: number,
): boolean {
  return subjectHits >= 2 && utilityStateHits >= 1;
}

/**
 * Detects whether a short heading likely introduces trailing related-content or
 * taxonomy chrome.
 * @param text - Visible heading text read from a candidate trailing section.
 * @returns Whether the heading looks like a trailing chrome boundary.
 */
function isLikelyTrailingChromeHeading(text: string): boolean {
  const { words } = normalizeTextSegment(text);
  if (words.length === 0 || words.length > 5) {
    return false;
  }

  return countSignalHits(words, TRAILING_CHROME_HEADING_TOKENS) >= 2;
}

/**
 * Returns a normalized text segment for short utility and chrome classifiers.
 * @param value - Visible text to normalize.
 * @returns Lowercase alphanumeric text plus its token list.
 */
function normalizeTextSegment(value: string): NormalizedTextSegment {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return {
    normalized,
    words: normalized ? normalized.split(/\s+/).filter(Boolean) : [],
  };
}

/**
 * Flattens a sanitized HTML fragment into visible text for local classifier
 * heuristics without depending on the wider sanitize feature surface.
 * @param value - Sanitized HTML or plain text to flatten.
 * @returns Visible text with stable internal spacing.
 */
function toClassifierPlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
