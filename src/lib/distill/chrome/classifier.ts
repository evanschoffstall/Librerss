/** Generic words that indicate contact or author-side chrome modules. */
const CONTACT_SIGNAL_TOKENS = new Set([
  "contact",
  "media",
  "press",
  "spokesperson",
  "staff",
  "team",
]);

/** Generic words that indicate related-content or navigation modules. */
const RELATED_MODULE_TOKENS = new Set([
  "case",
  "cases",
  "explore",
  "issue",
  "issues",
  "learn",
  "more",
  "next",
  "related",
  "release",
  "releases",
  "stories",
  "story",
]);

/** Generic words that indicate low-signal engagement chrome. */
const STANDALONE_UTILITY_SIGNAL_TOKENS = new Set([
  "download",
  "related",
  "sharing",
  "status",
]);

/**
 * Counts generic interface and engagement signal groups that indicate a
 * candidate includes related cards, contact modules, cookie prompts, or
 * interaction UI rather than pure article prose.
 * @param value - Visible candidate text to inspect.
 * @returns Count of chrome-like signal groups found in the text.
 */
export function countBoilerplateSignals(value: string): number {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return 0;

  const words = normalized.split(/\s+/).filter(Boolean);
  return [
    hasCookieUtilitySignal(words),
    hasContactCardSignal(words),
    hasRelatedModuleSignal(words),
    hasEngagementSignal(words, normalized),
    hasStandaloneUtilitySignal(words),
  ].filter(Boolean).length;
}

/**
 * Detects contact-card prose that commonly wraps article pages.
 * @param words - Normalized candidate words.
 * @returns Whether the text looks like a contact or spokesperson module.
 */
function hasContactCardSignal(words: string[]): boolean {
  return (
    hasSignalWord(words, new Set(["contact", "spokesperson"])) &&
    hasSignalWord(words, CONTACT_SIGNAL_TOKENS)
  );
}

/**
 * Detects cookie or share prompts that belong to service chrome.
 * @param words - Normalized candidate words.
 * @returns Whether a cookie or sharing utility notice is present.
 */
function hasCookieUtilitySignal(words: string[]): boolean {
  return (
    hasSignalWord(words, new Set(["cookie", "cookies"])) &&
    hasSignalWord(words, new Set(["accept", "settings", "share", "sharing"]))
  );
}

/**
 * Detects engagement counters and acknowledgement UI text.
 * @param words - Normalized candidate words.
 * @param normalized - Normalized visible candidate text.
 * @returns Whether the text includes engagement chrome signals.
 */
function hasEngagementSignal(words: string[], normalized: string): boolean {
  return (
    /\b\d+\s+(?:like|likes|view|views)\b/i.test(normalized) ||
    (hasSignalWord(words, new Set(["already", "thank"])) &&
      hasSignalWord(words, new Set(["liked", "liking"])))
  );
}

/**
 * Detects related-story and adjacent navigation prompts inside a candidate.
 * @param words - Normalized candidate words.
 * @returns Whether the text looks like a related-content module.
 */
function hasRelatedModuleSignal(words: string[]): boolean {
  return (
    hasSignalWord(
      words,
      new Set(["explore", "learn", "more", "next", "related"]),
    ) && hasSignalWord(words, RELATED_MODULE_TOKENS)
  );
}

/**
 * Returns whether a normalized word list contains any token from a signal set.
 * @param words - Normalized candidate words.
 * @param signals - Signal tokens that increase chrome confidence.
 * @returns Whether any normalized word belongs to the signal set.
 */
function hasSignalWord(words: string[], signals: ReadonlySet<string>): boolean {
  return words.some((word) => signals.has(word));
}

/**
 * Detects isolated utility labels that often appear beside non-article chrome.
 * @param words - Normalized candidate words.
 * @returns Whether the text includes standalone utility labels.
 */
function hasStandaloneUtilitySignal(words: string[]): boolean {
  return hasSignalWord(words, STANDALONE_UTILITY_SIGNAL_TOKENS);
}
