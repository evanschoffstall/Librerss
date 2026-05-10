/** Generic verbs that identify interactive media-widget controls. */
const MEDIA_UTILITY_ACTIONS = new Set([
  "click",
  "download",
  "enlarge",
  "expand",
  "open",
  "opens",
  "save",
  "see",
  "show",
  "view",
  "zoom",
]);

/** Generic nouns commonly used by media utility controls. */
const MEDIA_UTILITY_SUBJECTS = new Set([
  "details",
  "file",
  "image",
  "images",
  "info",
  "information",
  "media",
  "photo",
  "photos",
  "picture",
  "pictures",
  "tab",
  "video",
  "window",
]);

/** Exact short labels that describe media widgets instead of article prose. */
const MEDIA_INFO_LABELS = new Set([
  "image info",
  "image information",
  "photo info",
  "photo information",
]);

/** Generic labels that usually indicate standalone media source attribution. */
const MEDIA_ATTRIBUTION_LABELS = new Set([
  "attribution",
  "courtesy",
  "credit",
  "credits",
  "source",
  "sources",
  "usage",
]);

/** Generic media attribution values that do not belong in article prose. */
const MEDIA_ATTRIBUTION_VALUES = new Set([
  "domain",
  "handout",
  "provided",
  "public",
  "supplied",
]);

/**
 * Describes a normalized short utility label ready for classifier checks.
 */
interface NormalizedUtilityLabel {
  normalized: string;
  words: string[];
}

/**
 * Detects link labels that operate a media widget rather than conveying article
 * content. The classifier stays publisher-agnostic by relying on generic
 * action and subject words instead of literal site copy.
 * @param value - Visible anchor text associated with a media widget.
 * @returns Whether the text is a utility label that should be removed.
 */
export function isMediaUtilityLinkText(value: string): boolean {
  const label = readNormalizedUtilityLabel(value);
  if (label === null) return false;

  return (
    MEDIA_INFO_LABELS.has(label.normalized) ||
    label.normalized.startsWith("show me another ") ||
    isOpenInNewSurfaceLabel(label) ||
    isShortMediaCommand(label) ||
    isVerbSubjectMediaUtility(label)
  );
}

/**
 * Removes standalone text nodes that only contribute media source attribution
 * labels such as credits or usage notes.
 * @param content - Sanitized article HTML that may still contain attribution text.
 * @returns HTML with standalone media attribution text removed.
 */
export function stripStandaloneMediaAttributionText(content: string): string {
  return content.replace(
    /(^|>)([^<]*)(?=<|$)/g,
    (match, prefix: string, text: string) =>
      isStandaloneMediaAttributionText(text) ? prefix : match,
  );
}

/**
 * Returns whether a word list contains at least one member from a signal set.
 * @param words - Normalized words extracted from a utility label.
 * @param values - Signal words that indicate a utility label class.
 * @returns Whether any normalized word belongs to the signal set.
 */
function hasAnyWord(words: string[], values: ReadonlySet<string>): boolean {
  return words.some((word) => values.has(word));
}

/**
 * Detects generic "open in new tab/window" phrasing for media controls.
 * @param label - Normalized utility label.
 * @returns Whether the label is an open-in-new-surface utility control.
 */
function isOpenInNewSurfaceLabel(label: NormalizedUtilityLabel): boolean {
  return (
    (label.normalized.startsWith("open in new ") ||
      label.normalized.startsWith("opens in new ") ||
      label.normalized.startsWith("opens in a new ")) &&
    hasAnyWord(label.words, MEDIA_UTILITY_SUBJECTS)
  );
}

/**
 * Detects short command-style media utility labels such as download, view, or
 * zoom prompts.
 * @param label - Normalized utility label.
 * @returns Whether the label is a short command-style media control.
 */
function isShortMediaCommand(label: NormalizedUtilityLabel): boolean {
  if (
    label.normalized.startsWith("click to ") ||
    label.normalized.startsWith("view ") ||
    label.normalized.startsWith("save ") ||
    label.normalized.startsWith("download") ||
    label.normalized.startsWith("enlarge") ||
    label.normalized.startsWith("zoom in")
  ) {
    return hasAnyWord(label.words, MEDIA_UTILITY_SUBJECTS);
  }

  return false;
}

/**
 * Detects standalone source-attribution text fragments that often sit beside
 * media widgets and should not enter reader prose.
 * @param value - Visible text node content from sanitized article HTML.
 * @returns Whether the text is a source attribution rather than article prose.
 */
function isStandaloneMediaAttributionText(value: string): boolean {
  const label = readNormalizedUtilityLabel(value);
  return (
    label !== null &&
    hasAnyWord(label.words, MEDIA_ATTRIBUTION_LABELS) &&
    hasAnyWord(label.words, MEDIA_ATTRIBUTION_VALUES)
  );
}

/**
 * Detects verb-led media utility labels that name their media subject directly.
 * @param label - Normalized utility label.
 * @returns Whether the label is a generic verb-plus-subject media control.
 */
function isVerbSubjectMediaUtility(label: NormalizedUtilityLabel): boolean {
  return (
    MEDIA_UTILITY_ACTIONS.has(label.words[0] ?? "") &&
    hasAnyWord(label.words, MEDIA_UTILITY_SUBJECTS)
  );
}

/**
 * Normalizes a utility label and rejects empty or long prose-like values.
 * @param value - Anchor or text-node content to normalize.
 * @returns Normalized label details when the text is short enough to classify.
 */
function readNormalizedUtilityLabel(
  value: string,
): NormalizedUtilityLabel | null {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return null;

  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length <= 8 ? { normalized, words } : null;
}
