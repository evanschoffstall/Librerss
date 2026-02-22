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
 * Heading text patterns that indicate a related-articles / widget section
 * injected by wire services (AP, Reuters, etc.) into article bodies.
 */
const RELATED_HEADING_PATTERN =
  /^\s*(?:more\s+on|related(?:\s+(?:stories|articles|content|links|news))?|see\s+also|also\s+(?:of\s+interest|read)|you\s+may\s+(?:also\s+)?like|trending\s+now|popular\s+now|from\s+our\s+partners)\b/i;

/**
 * Post-sanitize pass that removes orphaned related-article sections from
 * already-sanitized HTML.
 *
 * When content was stored before {@link stripApJunkBlocks} was introduced the
 * sanitizer stripped the wrapper `<div class="hub-peek">` but kept its inner
 * `<h2>`, `<ul>/<li>/<a>` children because those are all in the tag allowlist.
 * This function detects the resulting pattern – a heading whose text matches
 * {@link RELATED_HEADING_PATTERN} followed (optionally with whitespace) by a
 * `<ul>` or `<ol>` – and removes both the heading and the list.
 */
function stripOrphanedRelatedBlocks(html: string): string {
  // Step 1 – heading + immediately following list.
  // The \s* between the closing heading tag and <ul>/<ol> handles cases where
  // the sanitizer left a newline or space between them.
  let result = html.replace(
    /<h[1-6]>([^<]*)<\/h[1-6]>\s*<(?:ul|ol)[\s\S]*?<\/(?:ul|ol)>/gi,
    (match, headingText: string) =>
      RELATED_HEADING_PATTERN.test(headingText) ? "" : match,
  );

  // Step 2 – stray heading with no following list (can be left behind if the
  // list was already removed or appears at the very end of the content).
  result = result.replace(
    /<h[1-6]>([^<]*)<\/h[1-6]>/gi,
    (match, headingText: string) =>
      RELATED_HEADING_PATTERN.test(headingText) ? "" : match,
  );

  return collapseExcessNewlines(result);
}

/**
 * Collapses runs of more than
 * {@link CONFIG.MAX_ARTICLE_CONSECUTIVE_BLANK_LINES} consecutive blank lines
 * in sanitized HTML.
 * Handles raw `\n` sequences, consecutive `<br>` tags, and consecutive
 * empty `<p>` elements so the rendered article never has large vertical gaps.
 */
function collapseExcessNewlines(html: string): string {
  const maxConsecutiveBlankLines = CONFIG.MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
  const minOverflowRun = maxConsecutiveBlankLines + 1;

  return (
    html
      // Normalize CRLF/CR to LF so newline collapsing is deterministic.
      .replace(/\r\n?/g, "\n")
      // N+1 consecutive <br> tags (with optional whitespace between) → N.
      .replace(
        new RegExp(`((?:<br\\s*\\/?>[\\s\\n]*){${minOverflowRun},})`, "gi"),
        "<br>".repeat(maxConsecutiveBlankLines),
      )
      // N+1 consecutive blank paragraphs (empty, nbsp, or <br>-only) → N.
      .replace(
        new RegExp(
          `((?:<p>(?:\\s|&nbsp;|&#160;|<br\\s*\\/?>)*<\\/p>\\s*){${minOverflowRun},})`,
          "gi",
        ),
        "<p></p>".repeat(maxConsecutiveBlankLines),
      )
      // N+1 raw newlines (optionally separated by spaces/tabs) → N.
      .replace(
        new RegExp(`(?:\\n[ \\t]*){${minOverflowRun},}`, "g"),
        "\n".repeat(maxConsecutiveBlankLines),
      )
      // N+1 whitespace-only lines (spaces/tabs before newline) → N.
      .replace(
        new RegExp(`(?:[ \\t]*\\n){${minOverflowRun},}`, "g"),
        "\n".repeat(maxConsecutiveBlankLines),
      )
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
    "img",
    "hr",
  ],
  // aside/nav/section are discarded along with their text so that sidebars
  // and related-article blocks don't appear in place of article body text.
  nonTextTags: ["style", "script", "textarea", "aside", "nav", "section"],
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
 * Exported for use when serving already-stored article content that may have
 * been saved before the pre-sanitize AP-block stripping was introduced.
 */
export { stripOrphanedRelatedBlocks };

/**
 * Strips all HTML tags that are not in the allowed set and forces links to
 * open safely (`rel="noopener noreferrer nofollow"`, `target="_blank"`).
 *
 * Returns an empty string for empty / whitespace-only input.
 */
export function sanitizeArticleHtml(raw: string): string {
  if (!raw.trim()) return "";
  const sanitized = sanitizeHtml(
    stripApJunkBlocks(raw),
    ARTICLE_SANITIZE_OPTIONS,
  );
  return stripOrphanedRelatedBlocks(sanitized).trim();
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
