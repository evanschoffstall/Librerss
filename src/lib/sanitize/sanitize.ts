import { CONFIG, maxArticleConsecutiveBlankLines } from "@/lib/config";
import sanitizeHtml from "sanitize-html";
import {
  normalizeArticleHtmlSpacing,
  stripApJunkBlocks,
  stripEmbeddedMediaBlocks,
  stripOrphanedRelatedBlocks,
} from "./cleaners";
import { ARTICLE_SANITIZE_OPTIONS } from "./patterns";

/**
 * Converts HTML to plain text by stripping tags and normalizing whitespace.
 * Used for article preview generation.
 */
export function toPlainText(value: string): string {
  const maxConsecutiveBlankLines = maxArticleConsecutiveBlankLines();
  const minOverflowRun = maxConsecutiveBlankLines + 1;

  return stripEmbeddedMediaBlocks(value)
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "\n")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(?:p|div|section|article|blockquote|li|h[1-6]|ul|ol|pre)>/gi,
      "\n",
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(
      new RegExp(`(?:\\n){${minOverflowRun},}`, "g"),
      "\n".repeat(maxConsecutiveBlankLines),
    )
    .trim();
}

export { normalizeArticleHtmlSpacing, stripOrphanedRelatedBlocks };

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  const decodeNumericEntity = (
    rawCodePoint: string,
    radix: 10 | 16,
  ): string => {
    try {
      return String.fromCodePoint(Number.parseInt(rawCodePoint, radix));
    } catch {
      return "";
    }
  };

  const decoded = value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (match, rawEntity: string) => {
      const entity = rawEntity.toLowerCase();

      if (entity.startsWith("#x")) {
        return decodeNumericEntity(entity.slice(2), 16);
      }

      if (entity.startsWith("#")) {
        return decodeNumericEntity(entity.slice(1), 10);
      }

      return namedEntities[entity] ?? "";
    },
  );

  return decoded.replace(/&[a-z0-9#]+;/gi, "");
}

export const __decodeHtmlEntitiesForTests = decodeHtmlEntities;

export { decodeHtmlEntities };

/**
 * Strips all HTML tags that are not in the allowed set and forces links to
 * open safely (`rel="noopener noreferrer nofollow"`, `target="_blank"`).
 *
 * Returns an empty string for empty / whitespace-only input.
 */
export function sanitizeArticleHtml(raw: string): string {
  if (!raw.trim()) return "";
  const sanitized = sanitizeHtml(
    stripEmbeddedMediaBlocks(stripApJunkBlocks(raw)),
    ARTICLE_SANITIZE_OPTIONS,
  );
  return normalizeArticleHtmlSpacing(stripOrphanedRelatedBlocks(sanitized));
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
    decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim() || "Untitled";
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
