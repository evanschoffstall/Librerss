import { CONFIG } from "@/lib/config";

export const AP_JUNK_CLASS_PATTERN =
  /(?:hub[\s_-]?peek|related[\s_-]?stories|related[\s_-]?content|related[\s_-]?links|more[\s_-]?on|tag[\s_-]?page|inline[\s_-]?module)/i;

export const RELATED_HEADING_PATTERN =
  /^\s*(?:more\s+on|related(?:\s+(?:stories|articles|content|links|news))?|see\s+also|also\s+(?:of\s+interest|read)|you\s+may\s+(?:also\s+)?like|trending\s+now|popular\s+now|from\s+our\s+partners)\b/i;

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
