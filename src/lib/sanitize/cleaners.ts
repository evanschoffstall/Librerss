import { maxArticleConsecutiveBlankLines } from "@/lib/config";
import {
  hasApJunkClass,
  isRelatedHeading,
  manipulateAttrValue,
} from "./patterns";
import { purifyRawHtml } from "./purify";

function normalizeNoscriptForManipulation(rawHtml: string): string {
  return rawHtml.replace(
    /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi,
    (_match, innerHtml: string) => {
      const plainText = toPlainText(innerHtml).replace(/\s+/g, " ").trim();
      const blockElementCount = (
        innerHtml.match(/<(?:p|h[1-6]|li|blockquote|figure|img)\b/gi) ?? []
      ).length;
      const isLikelyArticleFallback =
        blockElementCount >= 3 && plainText.length >= 220;

      return isLikelyArticleFallback ? innerHtml : "";
    },
  );
}

export function stripApJunkBlocks(html: string): string {
  const marked = html.replace(
    /<(div|section|aside|nav|ul|figure)\b[^>]*>/gi,
    (openTag, tagName: string) =>
      hasApJunkClass(openTag)
        ? `<!--STRIP_${tagName.toUpperCase()}-->`
        : openTag,
  );
  return marked.replace(
    /<!--STRIP_(DIV|SECTION|ASIDE|NAV|UL|FIGURE)-->(?:[\s\S]*?)<\/\1>/gi,
    "",
  );
}

export function stripEmbeddedMediaBlocks(html: string): string {
  return html
    .replace(/<(iframe|video|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, "\n")
    .replace(/<(iframe|video|object|embed)\b[^>]*\/?>/gi, "\n");
}

/** Converts HTML to plain text by stripping tags and normalizing whitespace. */
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

function collapseExcessNewlines(html: string): string {
  const maxConsecutiveBlankLines = maxArticleConsecutiveBlankLines();
  const minOverflowRun = maxConsecutiveBlankLines + 1;

  return html
    .replace(/\r\n?/g, "\n")
    .replace(
      new RegExp(`((?:<br\\s*\\/?>[\\s\\n]*){${minOverflowRun},})`, "gi"),
      "<br>".repeat(maxConsecutiveBlankLines),
    )
    .replace(
      new RegExp(
        `((?:<p>(?:\\s|&nbsp;|&#160;|<br\\s*\\/?>)*<\\/p>\\s*){${minOverflowRun},})`,
        "gi",
      ),
      "<p></p>".repeat(maxConsecutiveBlankLines),
    )
    .replace(
      new RegExp(`(?:\\n[ \\t]*){${minOverflowRun},}`, "g"),
      "\n".repeat(maxConsecutiveBlankLines),
    )
    .replace(
      new RegExp(`(?:[ \\t]*\\n){${minOverflowRun},}`, "g"),
      "\n".repeat(maxConsecutiveBlankLines),
    );
}

function isEmptyInlineHtml(content: string): boolean {
  const withoutFormattingTags = content.replace(
    /<\/?(?:strong|em|b|i|u|span)\b[^>]*>/gi,
    "",
  );
  const withoutBreaks = withoutFormattingTags.replace(/<br\s*\/?>/gi, " ");
  const withoutNbspEntities = withoutBreaks
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ");

  return withoutNbspEntities.trim().length === 0;
}

function stripEmptyTagBlocks(html: string): string {
  return html.replace(
    /<(p|figure)>([\s\S]*?)<\/\1>\s*/gi,
    (match, _tag, content: string) => (isEmptyInlineHtml(content) ? "" : match),
  );
}

export function stripOrphanedRelatedBlocks(html: string): string {
  const withoutHeadingLists = html.replace(
    /<h[1-6]>([^<]*)<\/h[1-6]>\s*<(?:ul|ol)[\s\S]*?<\/(?:ul|ol)>/gi,
    (match, headingText: string) =>
      isRelatedHeading(headingText) ? "" : match,
  );

  const withoutLooseHeadings = withoutHeadingLists.replace(
    /<h[1-6]>([^<]*)<\/h[1-6]>/gi,
    (match, headingText: string) =>
      isRelatedHeading(headingText) ? "" : match,
  );

  return collapseExcessNewlines(withoutLooseHeadings);
}

export function normalizeArticleHtmlSpacing(html: string): string {
  return stripEmptyTagBlocks(html)
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]*\n+/g, "\n")
    .replace(/>\s*\n\s*\n+\s*</g, ">\n<")
    .trim();
}

/**
 * Strip short inline content that appears between block-level elements at the
 * top level of the document.  After sanitize-html strips non-allowed tags
 * (div, span, figure, time, etc.), their text content is left as orphaned
 * inline nodes — bylines, image credits, UI labels, timestamps, etc.
 *
 * Only segments whose plain-text length is under {@link maxTextLength} are
 * removed.  Content inside block elements is never touched.
 */
export function stripOrphanedInlineContent(
  html: string,
  maxTextLength = 200,
): string {
  const blockBoundaryRe =
    /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre)\b[^>]*>|<(?:hr|img)\b[^>]*\/?>/gi;

  const parts: { type: "tag" | "gap"; content: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockBoundaryRe.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "gap", content: html.slice(lastIndex, match.index) });
    }
    parts.push({ type: "tag", content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    parts.push({ type: "gap", content: html.slice(lastIndex) });
  }

  // If no block boundaries were found, the content is purely inline — return as-is.
  if (parts.every((p) => p.type === "gap")) return html;

  // Track block-element nesting depth to identify top-level gaps.
  let depth = 0;
  let prevTagIsImg = false;
  return parts
    .map((part) => {
      if (part.type === "tag") {
        const tag = part.content;
        prevTagIsImg = /^<img\b/i.test(tag);
        if (/^<(?:hr|img)\b/i.test(tag)) {
          /* self-closing — depth unchanged */
        } else if (/^<\//i.test(tag)) {
          depth = Math.max(0, depth - 1);
        } else {
          depth++;
        }
        return part.content;
      }

      // Gap at top level (depth === 0): strip if plain text is short AND
      // the gap contains no semantic inline elements AND does not follow <img>
      // (text after images is likely a caption).
      if (depth === 0 && !prevTagIsImg) {
        const hasSemanticInline = /<(?:a|strong|em|b|i|u|code)\b/i.test(
          part.content,
        );
        if (!hasSemanticInline) {
          const plainText = part.content
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim();
          const wordCount = plainText.split(/\s+/).filter(Boolean).length;
          const looksLikeProse = wordCount >= 12 || /[.?!"“”]/.test(plainText);
          if (
            plainText.length > 0 &&
            plainText.length <= maxTextLength &&
            !looksLikeProse
          ) {
            return "";
          }
        }
      }
      prevTagIsImg = false;

      return part.content;
    })
    .join("");
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  ldquo: "\u201C",
  rdquo: "\u201D",
  lsquo: "\u2018",
  rsquo: "\u2019",
  hellip: "\u2026",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  bull: "\u2022",
  middot: "\u00B7",
  laquo: "\u00AB",
  raquo: "\u00BB",
  emdash: "\u2014",
  euro: "\u20AC",
};

function decodeNumericEntity(raw: string, radix: 10 | 16): string {
  try {
    return String.fromCodePoint(Number.parseInt(raw, radix));
  } catch {
    return "";
  }
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (_match, rawEntity: string) => {
      const entity = rawEntity.toLowerCase();
      if (entity.startsWith("#x"))
        return decodeNumericEntity(entity.slice(2), 16);
      if (entity.startsWith("#"))
        return decodeNumericEntity(entity.slice(1), 10);
      return NAMED_ENTITIES[entity] ?? "";
    },
  );
}

export function toParagraphHtml(raw: string): string {
  return raw
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => `<p>${segment.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function removeElementsByAttrPattern(
  html: string,
  attr: string,
  pattern: RegExp,
): string {
  const openRe = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  let result = html;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(result)) !== null) {
    const attrValue = manipulateAttrValue(match[2] ?? "", attr);
    if (attrValue === null || !pattern.test(attrValue)) continue;
    const tagName = match[1]!.toLowerCase();
    const afterOpen = match.index + match[0].length;
    const closeRe = /<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi;
    closeRe.lastIndex = afterOpen;
    let depth = 1;
    let endIdx = -1;
    let m: RegExpExecArray | null;
    while (depth > 0 && (m = closeRe.exec(result)) !== null) {
      if (m[1]?.toLowerCase() !== tagName) continue;
      if (m[0].startsWith("</")) depth--;
      else depth++;
      if (depth === 0) endIdx = m.index + m[0].length;
    }
    if (endIdx < 0) continue;
    result = result.slice(0, match.index) + result.slice(endIdx);
    openRe.lastIndex = match.index;
  }
  return result;
}

/** Semantic purpose words in element IDs indicating non-content containers. */
const NON_CONTENT_ID_RE =
  /comment(?!.*count)|paywall|social[-_]?share|share[-_]?bar|utility[-_]?bar/i;

/** Semantic purpose words in CSS classes indicating non-content containers. */
const NON_CONTENT_CLASS_RE =
  /sign[-_]?up|subscrib(?:e[-_]?(?:widget|form|bar|banner|button|cta|prompt|modal|popup|overlay)|tion[-_]?(?:widget|form|bar|banner))|newsletter[-_]?(?:sign|sub|widget|form|bar|banner|popup|modal|overlay|cta|promo|prompt|optin)|social[-_]?share|share[-_]?(?:bar|tool|button|widget)|utility[-_]?bar|comments?[-_]?(?:container|widget|wrapper|area|form)|promo(?:tion)?[-_]?(?:bar|banner|block|card)|cta[-_](?:bar|banner|block)|call[-_]?to[-_]?action|follow[-_]?(?:us|bar)|whatsapp[-_]?(?:bar|link|share)/i;

/** Social platform share-intent URL patterns (cross-site generic). */
export const SOCIAL_SHARE_LINK_RE =
  /twitter\.com\/share|facebook\.com\/sharer|reddit\.com\/submit|linkedin\.com\/sharearticle|api\.whatsapp\.com\/send|intent\/tweet|x\.com\/intent\/tweet|mailto:\?/i;

/**
 * Strip noise containers (scripts, styles, headers, footers, comment widgets,
 * pure-link lists, social share blocks, nosnippet asides) from raw HTML before
 * passing to the content manipulator.
 *
 * CRITICAL: This function receives raw HTML from upstream sources and MUST
 * call purifyRawHtml() as the VERY FIRST operation to strip XSS vectors
 * before any other processing.
 */
export function preCleanHtml(rawHtml: string): string {
  // MANDATORY: DOMPurify as first line of defense against XSS
  const purified = purifyRawHtml(rawHtml);

  let html = normalizeNoscriptForManipulation(purified)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, "");

  html = removeElementsByAttrPattern(html, "id", NON_CONTENT_ID_RE);
  html = removeElementsByAttrPattern(html, "class", NON_CONTENT_CLASS_RE);

  html = html.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (ulBlock) => {
    const items = [...ulBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    if (items.length === 0) return ulBlock;
    const allBareLinks = items.every((m) =>
      /^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test((m[1] ?? "").trim()),
    );
    if (allBareLinks && items.length >= 8) return "";
    if (
      allBareLinks &&
      items.every((m) => SOCIAL_SHARE_LINK_RE.test(m[1] ?? ""))
    )
      return "";
    return ulBlock;
  });

  html = html.replace(
    /<aside\b[^>]*\bdata-nosnippet\b[^>]*>[\s\S]*?<\/aside>/gi,
    "",
  );

  return html;
}
