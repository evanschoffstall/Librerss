import { CONFIG } from "@/lib/config";
import sanitizeHtml from "sanitize-html";

/**
 * Class-name fragments used by AP News (and similar wire-service feeds) to
 * wrap "related articles" / "hub-peek" sections.  These blocks survive generic
 * sanitization because their inner content uses otherwise-allowed tags
 * (h2, ul, li, a).  We strip the entire element – including its subtree –
 * before running sanitize-html so no stray headings or link lists appear in
 * the rendered article body.
 *
 * Patterns are matched against the element's `class` attribute (case-insensitive).
 */
const AP_JUNK_CLASS_PATTERN =
  /(?:hub[\s_-]?peek|related[\s_-]?stories|related[\s_-]?content|related[\s_-]?links|more[\s_-]?on|tag[\s_-]?page|inline[\s_-]?module)/i;

/**
 * Strips AP-style related-article / sidebar blocks from raw HTML before the
 * main sanitizer runs.  Removes block-level elements whose `class` attribute
 * matches {@link AP_JUNK_CLASS_PATTERN} plus all of their inner HTML.
 */
function stripApJunkBlocks(html: string): string {
  // Match common block wrappers: div, section, aside, nav, ul, figure.
  return html
    .replace(
      /<(div|section|aside|nav|ul|figure)(\s[^>]*)?>/gi,
      (openTag, tagName: string, attrs: string = "") => {
        if (AP_JUNK_CLASS_PATTERN.test(attrs)) {
          // Replace the opening tag with a sentinel comment so we can slice out
          // everything up to (and including) the matching closing tag.
          return `<!--STRIP_${tagName.toUpperCase()}-->`;
        }
        return openTag;
      },
    )
    .replace(
      /<!--STRIP_(DIV|SECTION|ASIDE|NAV|UL|FIGURE)-->(?:[\s\S]*?)<\/\1>/gi,
      "",
    );
}

/**
 * Shared sanitize-html options for all article / RSS content.
 * Used by the RSS feed fetcher, manual article POST endpoint, and article
 * extractor so every write path enforces the same tag-allowlist.
 */
const ARTICLE_SANITIZE_OPTIONS = {
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
  ],
  // figure/figcaption, aside, nav, section are discarded along with their
  // text so that image captions, sidebars, and related-article blocks don't
  // appear in place of article body text.
  nonTextTags: [
    "figure",
    "figcaption",
    "style",
    "script",
    "textarea",
    "aside",
    "nav",
    "section",
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
  return sanitizeHtml(stripApJunkBlocks(raw), ARTICLE_SANITIZE_OPTIONS).trim();
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
