const AP_JUNK_CLASS_MARKERS = [
  "article callout",
  "hub peek",
  "related stories",
  "related content",
  "related links",
  "more on",
  "tag page",
  "inline module",
] as const;

const RELATED_HEADING_EXACT_PREFIXES = [
  "more on",
  "see also",
  "trending now",
  "popular now",
  "from our partners",
  "downloads",
] as const;

const RELATED_HEADING_RELATED_PREFIXES = [
  "related",
  "also",
  "you may like",
  "you may also like",
] as const;

/**
 * Detects class names that wrap publisher inserts rather than reader content,
 * allowing cleanup to remove the whole block before tag-level sanitization would
 * flatten its links, images, and CTA text into the article body.
 * @param attrs - Raw opening-tag attributes to inspect.
 * @returns Whether the element should be treated as non-article junk.
 */
export function hasApJunkClass(attrs: string): boolean {
  const normalized = normalizePhrase(attrs);
  return AP_JUNK_CLASS_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * Return whether is related heading.
 * @param headingText - The heading text.
 * @returns Whether is related heading.
 */
export function isRelatedHeading(headingText: string): boolean {
  const normalized = normalizePhrase(headingText);
  if (!normalized) {
    return false;
  }

  if (
    RELATED_HEADING_EXACT_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix),
    )
  ) {
    return true;
  }

  if (normalized.startsWith("related ")) {
    return true;
  }

  if (normalized.startsWith("also of interest") || normalized === "also read") {
    return true;
  }

  return RELATED_HEADING_RELATED_PREFIXES.includes(
    normalized as (typeof RELATED_HEADING_RELATED_PREFIXES)[number],
  );
}

/**
 * Read the value of a named attribute from a raw HTML attribute string.
 * @param attrsStr - The raw attribute string extracted from an HTML tag.
 * @param attrName - The lowercase attribute name to look up.
 * @returns The attribute value, or null if the attribute is not present.
 */
export function readAttrValue(
  attrsStr: string,
  attrName: string,
): null | string {
  const re = /\b([a-z][a-z0-9:-]*)=(['"])([\s\S]*?)\2/gi;
  let m: null | RegExpExecArray;
  while ((m = re.exec(attrsStr)) !== null) {
    if (m[1].toLowerCase() === attrName) return m[3];
  }
  return null;
}

/**
 * Normalize a phrase to lowercase with whitespace-collapsed single spaces.
 * @param value - The raw phrase string to normalize.
 * @returns The normalized lowercase phrase with collapsed whitespace.
 */
function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}
