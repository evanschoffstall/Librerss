import { CONFIG } from "@/lib/config";

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
] as const;

const RELATED_HEADING_RELATED_PREFIXES = [
  "related",
  "also",
  "you may like",
  "you may also like",
] as const;

function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

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

function parseDimension(value: string | undefined): number | null {
  if (!value) return null;

  const normalized = value.trim();
  if (!normalized || normalized.includes("%")) return null;

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
}

function isTooSmallImage(attribs: Record<string, string> | undefined): boolean {
  if (!attribs) return false;

  const width = parseDimension(attribs.width);
  const height = parseDimension(attribs.height);
  const hasSrcset = !!attribs.srcset?.trim();

  // If the image carries no size signal at all (no width, no height, no srcset)
  // we cannot verify it meets the minimum — discard it.  This catches author
  // avatars, tracking pixels, and generic placeholders that lack dimension
  // attributes and are not responsive images.
  if (width === null && height === null && !hasSrcset) {
    return true;
  }

  if (width !== null && width < CONFIG.MIN_ARTICLE_IMAGE_WIDTH_PX) {
    return true;
  }

  if (height !== null && height < CONFIG.MIN_ARTICLE_IMAGE_HEIGHT_PX) {
    return true;
  }

  return false;
}

function isKnownPlaceholderImage(
  attribs: Record<string, string> | undefined,
): boolean {
  if (!attribs) return false;

  const source = (attribs.src || "").trim().toLowerCase();
  if (!source) return false;

  return (
    source.includes("grey-placeholder") ||
    source.includes("gray-placeholder") ||
    source.includes("/placeholder") ||
    source.includes("placeholder.")
  );
}

export const ARTICLE_SANITIZE_OPTIONS = {
  allowedTags: [
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "a",
    "img",
    "hr",
  ],
  nonTextTags: [
    "style",
    "script",
    "textarea",
    "aside",
    "nav",
    "section",
    "iframe",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: [
      "src",
      "srcset",
      "sizes",
      "alt",
      "title",
      "width",
      "height",
      "loading",
      "decoding",
      "referrerpolicy",
    ],
    code: ["class"],
    pre: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  exclusiveFilter: (frame: { tag: string; attribs?: Record<string, string> }) =>
    frame.tag === "img" &&
    (isTooSmallImage(frame.attribs) || isKnownPlaceholderImage(frame.attribs)),
  transformTags: {
    a: (tagName: string, attribs: Record<string, string>) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      },
    }),
    img: (tagName: string, attribs: Record<string, string>) => {
      const sourceCandidate =
        attribs.src ||
        attribs["data-src"] ||
        attribs["data-original"] ||
        attribs["data-lazy-src"] ||
        attribs["data-url"] ||
        "";

      const trimmedSource = sourceCandidate.trim();

      return {
        tagName,
        attribs: {
          ...attribs,
          ...(trimmedSource ? { src: trimmedSource } : {}),
          referrerpolicy: attribs.referrerpolicy || "no-referrer",
          loading: attribs.loading || "lazy",
        },
      };
    },
  },
};
