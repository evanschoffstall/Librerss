import { CONFIG } from "@/lib/config";
import sanitizeHtml from "sanitize-html";
import {
  decodeHtmlEntities,
  normalizeArticleHtmlSpacing,
  stripApJunkBlocks,
  stripEmbeddedMediaBlocks,
  stripOrphanedInlineContent,
  stripOrphanedRelatedBlocks,
} from "./cleaners";
import { purifyRawHtml } from "./purify";

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
  if (width === null && height === null && !hasSrcset) return true;
  if (width !== null && width < CONFIG.MIN_ARTICLE_IMAGE_WIDTH_PX) return true;
  if (height !== null && height < CONFIG.MIN_ARTICLE_IMAGE_HEIGHT_PX)
    return true;
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

const ARTICLE_SANITIZE_OPTIONS = {
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
      "data-src",
      "data-original",
      "data-lazy-src",
      "data-url",
    ],
    code: ["class"],
    pre: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
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
      const trimmedSource = (
        attribs.src ||
        attribs["data-src"] ||
        attribs["data-original"] ||
        attribs["data-lazy-src"] ||
        attribs["data-url"] ||
        ""
      ).trim();
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

/**
 * Strips non-allowed HTML tags; forces safe link attributes.
 *
 * CRITICAL: This function may receive raw HTML from RSS feeds or other
 * external sources. DOMPurify is applied FIRST as mandatory XSS protection
 * before any downstream sanitization or transformation.
 */
export function sanitizeArticleHtml(raw: string): string {
  if (!raw.trim()) return "";

  // MANDATORY: DOMPurify as first line of defense against XSS
  const purified = purifyRawHtml(raw);

  const sanitized = sanitizeHtml(
    stripEmbeddedMediaBlocks(stripApJunkBlocks(purified)),
    ARTICLE_SANITIZE_OPTIONS,
  );
  return normalizeArticleHtmlSpacing(
    stripOrphanedInlineContent(stripOrphanedRelatedBlocks(sanitized)),
  );
}

/**
 * Sanitizes an article title: strips ALL HTML tags, trims whitespace, and
 * enforces {@link CONFIG.MAX_ARTICLE_TITLE_LENGTH}.
 *
 * RSS feed titles occasionally contain escaped or literal HTML
 * (e.g. `<b>Breaking</b>` or `<script>…</script>`); all markup must be
 * removed before the value is stored or rendered.
 */
export function sanitizeArticleTitle(title: string | null | undefined): string {
  const stripped = sanitizeHtml(title ?? "", {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
  const cleaned =
    decodeHtmlEntities(stripped)
      .replace(/&[a-z0-9#]+;/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "Untitled";
  if (cleaned.length <= CONFIG.MAX_ARTICLE_TITLE_LENGTH) return cleaned;
  // Slice to MAX-1 to leave room for the ellipsis so the result stays within
  // CONFIG.MAX_ARTICLE_TITLE_LENGTH.
  return `${cleaned.slice(0, CONFIG.MAX_ARTICLE_TITLE_LENGTH - 1).trim()}\u2026`;
}

/**
 * Sanitizes article HTML and enforces {@link CONFIG.MAX_ARTICLE_CONTENT_LENGTH}.
 *
 * Unlike naively calling `sanitizeArticleHtml` + `substring`, this function
 * re-sanitizes the truncated string so that any HTML tag broken at the hard
 * length boundary is properly closed before the content is stored.
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
