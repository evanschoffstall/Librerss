import sanitizeHtml from "sanitize-html";

import { CONFIG } from "@/lib";

import {
  decodeHtmlEntities,
  normalizeArticleHtmlSpacing,
  stripApJunkBlocks,
  stripEmbeddedMediaBlocks,
  stripEmptyAnchors,
  stripOrphanedInlineContent,
  stripOrphanedRelatedBlocks,
} from "./cleaners";
import { purifyRawHtml } from "./purify";

/**
 * Describes the exclusive filter frame.
 */
interface ExclusiveFilterFrame {
  attribs?: Record<string, string>;
  tag: string;
}

/**
 * Return whether is known placeholder image.
 * @param attribs - The attribs.
 * @returns Whether is known placeholder image.
 */
function isKnownPlaceholderImage(
  attribs: Record<string, string | undefined> | undefined,
): boolean {
  if (!attribs) return false;
  const source = (attribs.src ?? "").trim().toLowerCase();
  if (!source) return false;
  return (
    source.includes("grey-placeholder") ||
    source.includes("gray-placeholder") ||
    source.includes("/placeholder") ||
    source.includes("placeholder.")
  );
}

const NON_CONTENT_IMAGE_SOURCE_PATTERN =
  /(?:\/wp-content\/themes\/|\/extension\/|\/icons?\/|\/favicons?\/|favicon|logo(?:[@._-]|$)|icon(?:[@._-]|$)|avatar|placeholder|pixel|spacer|sprite)/i;

const NON_CONTENT_IMAGE_TEXT_PATTERN =
  /\b(?:avatar|logo|icon|menu|search|toggle|button|close|share|social|badge|placeholder|pixel|spacer|sprite)\b/i;
const INVISIBLE_INLINE_FORMATTING_PATTERN =
  /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
const NON_STANDARD_SPACE_PATTERN = /[\u00A0\u2007\u202F]/g;

/**
 * Return whether has likely content descriptor.
 * @param descriptor - The descriptor.
 * @returns Whether has likely content descriptor.
 */
function hasLikelyContentDescriptor(descriptor: string): boolean {
  if (!descriptor) {
    return false;
  }

  if (NON_CONTENT_IMAGE_TEXT_PATTERN.test(descriptor)) {
    return false;
  }

  return descriptor.length >= 12 || /\S+\s+\S+/.test(descriptor);
}

/**
 * Return whether has likely content image signal.
 * @param attribs - The attribs.
 * @returns Whether has likely content image signal.
 */
function hasLikelyContentImageSignal(
  attribs: Record<string, string | undefined> | undefined,
): boolean {
  if (!attribs) return false;

  const source = (attribs.src ?? "").trim();
  if (!source) return false;

  if (NON_CONTENT_IMAGE_SOURCE_PATTERN.test(source)) {
    return false;
  }

  const descriptor = readImageDescriptor(attribs);
  if (hasLikelyContentDescriptor(descriptor)) {
    return true;
  }

  return /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(source);
}

/**
 * Return whether has too small srcset.
 * @param srcset - The srcset.
 * @returns Whether has too small srcset.
 */
function hasTooSmallSrcset(srcset: string): boolean {
  return maxSrcsetWidth(srcset) < CONFIG.MIN_ARTICLE_IMAGE_WIDTH_PX;
}

/**
 * Return whether is below minimum dimensions.
 * @param width - The width.
 * @param height - The height.
 * @returns Whether is below minimum dimensions.
 */
function isBelowMinimumDimensions(
  width: null | number,
  height: null | number,
): boolean {
  return (
    (width !== null && width < CONFIG.MIN_ARTICLE_IMAGE_WIDTH_PX) ||
    (height !== null && height < CONFIG.MIN_ARTICLE_IMAGE_HEIGHT_PX)
  );
}

/**
 * Return whether is too small image.
 * @param attribs - The attribs.
 * @returns Whether is too small image.
 */
function isTooSmallImage(
  attribs: Record<string, string | undefined> | undefined,
): boolean {
  if (!attribs) return false;
  const width = parseDimension(attribs.width);
  const height = parseDimension(attribs.height);
  const srcset = attribs.srcset?.trim() ?? "";
  const hasSrcset = !!srcset;
  if (width === null && height === null && !hasSrcset) {
    return !hasLikelyContentImageSignal(attribs);
  }
  if (isBelowMinimumDimensions(width, height)) return true;
  // Reject images where every srcset width descriptor is below threshold
  // (catches small author avatars/icons that have srcset but no explicit dimensions).
  if (hasSrcset && width === null && height === null) {
    return hasTooSmallSrcset(srcset);
  }

  return false;
}

/**
 * Process the max srcset width.
 * @param srcset - The srcset.
 * @returns The max srcset width.
 */
function maxSrcsetWidth(srcset: string): number {
  const widths = [...srcset.matchAll(/\b(\d+)w\b/gi)].map((m) =>
    parseInt(m[1], 10),
  );
  return widths.length > 0 ? Math.max(...widths) : Infinity;
}

/**
 * Parse the dimension.
 * @param value - The value.
 * @returns The dimension.
 */
function parseDimension(value: string | undefined): null | number {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized || normalized.includes("%")) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Process the read image descriptor.
 * @param attribs - The attribs.
 * @returns The read image descriptor.
 */
function readImageDescriptor(
  attribs: Record<string, string | undefined>,
): string {
  return `${attribs.alt ?? ""} ${attribs.title ?? ""}`.trim();
}

const ARTICLE_SANITIZE_OPTIONS = {
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    code: ["class"],
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
      "data-src",
      "data-original",
      "data-lazy-src",
      "data-url",
    ],
    pre: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowedTags: [
    "p",
    "br",
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
  /**
   * Process the exclusive filter.
   * @param frame - The frame.
   * @returns Whether exclusive filter.
   */
  exclusiveFilter: (frame: ExclusiveFilterFrame) =>
    frame.tag === "img" &&
    (isTooSmallImage(frame.attribs) || isKnownPlaceholderImage(frame.attribs)),
  nonTextTags: [
    "h1",
    "style",
    "script",
    "textarea",
    "aside",
    "nav",
    "section",
    "iframe",
    "form",
    "button",
    "noscript",
    "label",
    "summary",
    "details",
    "dialog",
    "select",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "colgroup",
    "col",
  ],
  transformTags: {
    /**
     * Process the a.
     * @param tagName - The tag name.
     * @param attribs - The attribs.
     * @returns The a.
     */
    a: (tagName: string, attribs: Record<string, string>) => ({
      attribs: {
        ...attribs,
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      },
      tagName,
    }),
    /**
     * Process the img.
     * @param tagName - The tag name.
     * @param attribs - The attribs.
     * @returns The img.
     */
    img: (tagName: string, attribs: Record<string, string>) => {
      const trimmedSource = (
        attribs.src ||
        attribs["data-src"] ||
        attribs["data-original"] ||
        attribs["data-lazy-src"] ||
        attribs["data-url"] ||
        ""
      ).trim();
      return {
        attribs: {
          ...attribs,
          ...(trimmedSource ? { src: trimmedSource } : {}),
          decoding: attribs.decoding || "async",
          loading: "eager",
          referrerpolicy: attribs.referrerpolicy || "no-referrer",
        },
        tagName,
      };
    },
  },
};

/**
 * Process the sanitize and truncate article content.
 * @param raw - The raw.
 * @returns The sanitize and truncate article content.
 */
export function sanitizeAndTruncateArticleContent(raw: string): string {
  const sanitized = sanitizeArticleHtml(raw);

  if (sanitized.length <= CONFIG.MAX_ARTICLE_CONTENT_LENGTH) {
    return sanitized;
  }

  // Re-sanitize the truncated portion FIRST so any HTML tag broken at the
  // hard length boundary is properly closed before appending the sentinel.
  // Appending after ensures the notice is never inside a broken element.
  const cut = sanitizeArticleHtml(
    sanitized.substring(0, CONFIG.MAX_ARTICLE_CONTENT_LENGTH),
  );
  return `${cut}<p>\u2026 [content truncated]</p>`;
}

/**
 * Process the sanitize article html.
 * @param raw - The raw.
 * @returns The sanitize article html.
 */
export function sanitizeArticleHtml(raw: string): string {
  if (!raw.trim()) return "";

  // MANDATORY: sanitize-html first pass — strips scripts, event handlers, and
  // dangerous protocols before further transformations.
  const purified = purifyRawHtml(raw);

  const sanitized = sanitizeHtml(
    stripEmbeddedMediaBlocks(stripApJunkBlocks(purified)),
    ARTICLE_SANITIZE_OPTIONS,
  );
  return normalizeInvisibleArticleWhitespace(
    normalizeArticleHtmlSpacing(
      stripOrphanedInlineContent(
        stripOrphanedRelatedBlocks(stripEmptyAnchors(sanitized)),
      ),
    ),
  );
}

/**
 * Process the sanitize article title.
 * @param title - The title.
 * @returns The sanitize article title.
 */
export function sanitizeArticleTitle(title: null | string | undefined): string {
  const stripped = sanitizeHtml(title ?? "", {
    allowedAttributes: {},
    allowedTags: [],
  }).trim();
  // After decodeHtmlEntities, remaining entity-like patterns with 2+ char names
  // are unknown entities that sanitize-html double-encoded (e.g. &amp;foobar;
  // → &foobar;). Single-char patterns like &S; from "M&S;" are real text.
  const cleaned =
    decodeHtmlEntities(stripped)
      .replace(/&[a-z][a-z0-9]+;/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "Untitled";
  if (cleaned.length <= CONFIG.MAX_ARTICLE_TITLE_LENGTH) return cleaned;
  // Slice to MAX-1 to leave room for the ellipsis so the result stays within
  // CONFIG.MAX_ARTICLE_TITLE_LENGTH.
  return `${cleaned.slice(0, CONFIG.MAX_ARTICLE_TITLE_LENGTH - 1).trim()}\u2026`;
}

/**
 * Normalize invisible spacing artifacts that publishers often encode as HTML
 * entities. Keep visible editorial Unicode punctuation intact while removing
 * copy-hostile whitespace such as no-break spaces and zero-width format marks.
 * @param html - Sanitized article HTML.
 * @returns Article HTML without invisible formatting whitespace.
 */
function normalizeInvisibleArticleWhitespace(html: string): string {
  return html
    .replace(NON_STANDARD_SPACE_PATTERN, " ")
    .replace(INVISIBLE_INLINE_FORMATTING_PATTERN, "");
}
