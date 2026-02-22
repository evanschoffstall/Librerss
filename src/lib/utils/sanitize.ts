import { CONFIG } from "@/lib/config";
import sanitizeHtml from "sanitize-html";

/**
 * Shared sanitize-html options for all article / RSS content.
 * Used by the RSS feed fetcher, manual article POST endpoint, and article
 * extractor so every write path enforces the same tag-allowlist.
 */
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
    "hr",
    "figure",
    "figcaption",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    code: ["class"],
    pre: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (tagName: string, attribs: Record<string, string>) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      },
    }),
  },
};

/**
 * Strips all HTML tags that are not in the allowed set and forces links to
 * open safely (`rel="noopener noreferrer nofollow"`, `target="_blank"`).
 *
 * Returns an empty string for empty / whitespace-only input.
 */
export function sanitizeArticleHtml(raw: string): string {
  if (!raw.trim()) return "";
  return sanitizeHtml(raw, ARTICLE_SANITIZE_OPTIONS).trim();
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
  const cleaned = stripped || "Untitled";
  if (cleaned.length <= CONFIG.MAX_ARTICLE_TITLE_LENGTH) return cleaned;
  return cleaned.slice(0, CONFIG.MAX_ARTICLE_TITLE_LENGTH).trim() + "...";
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
