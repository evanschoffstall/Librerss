const AP_JUNK_CLASS_MARKERS = [
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

export function hasApJunkClass(attrs: string): boolean {
  const normalized = normalizePhrase(attrs);
  return AP_JUNK_CLASS_MARKERS.some((marker) => normalized.includes(marker));
}

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

/** Read the value of a named attribute from an HTML open-tag attribute string. */
export function readAttrValue(
  attrsStr: string,
  attrName: string,
): null | string {
  const re = /\b([a-z][a-z0-9:-]*)=["']([^"']*)['"]/gi;
  let m: null | RegExpExecArray;
  while ((m = re.exec(attrsStr)) !== null) {
    if (m[1]?.toLowerCase() === attrName) return m[2] ?? null;
  }
  return null;
}

function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}
