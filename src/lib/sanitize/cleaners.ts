import { hasApJunkClass, readAttrValue } from "./patterns";
import { purifyRawHtml } from "./purify";
import { normalizeNoscriptForManipulation } from "./text-cleaners";

export {
  stripLeadingInlineBioBlock,
  stripOrphanedInlineContent,
  stripOrphanedRelatedBlocks,
} from "./inline-cleaners";
export {
  decodeHtmlEntities,
  stripEmbeddedMediaBlocks,
  toPlainText,
} from "./text-cleaners";

/**
 * @param value
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param html
 */
export function normalizeArticleHtmlSpacing(html: string): string {
  return stripEmptyTagBlocks(html)
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]*\n+/g, "\n")
    .replace(/>\s*\n\s*\n+\s*</g, ">\n<")
    .trim();
}

/**
 * @param html
 */
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

/**
 * Strip anchor elements whose inner content contains no visible text and no
 * img child.  These are left behind when sanitize-html strips non-allowed
 * children (SVG icons, buttons) from inside a link.
 * @param html
 */
export function stripEmptyAnchors(html: string): string {
  return html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (match, inner: string) => {
    if (/<img\b/i.test(inner)) return match;
    return inner.replace(/<[^>]*>/g, "").trim().length === 0 ? "" : match;
  });
}

/**
 * @param raw
 */
export function toParagraphHtml(raw: string): string {
  return raw
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => `<p>${segment.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

/**
 * @param html
 * @param openMatch
 */
function findElementRemovalEndIndex(
  html: string,
  openMatch: RegExpExecArray,
): number {
  const tagName = openMatch[1].toLowerCase();
  const afterOpen = openMatch.index + openMatch[0].length;
  const closeRe = /<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi;
  closeRe.lastIndex = afterOpen;
  let depth = 1;
  let endIdx = -1;

  let nestedMatch: null | RegExpExecArray;
  while (depth > 0 && (nestedMatch = closeRe.exec(html)) !== null) {
    if (nestedMatch[1].toLowerCase() !== tagName) continue;
    depth += nestedMatch[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      endIdx = nestedMatch.index + nestedMatch[0].length;
    }
  }

  return endIdx;
}

/**
 * @param content
 */
function hasOnlyEmptyListItems(content: string): boolean {
  const listItems = [...content.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  if (listItems.length === 0) return isEmptyInlineHtml(content);
  return listItems.every((item) => isEmptyInlineHtml(item[1]));
}

/**
 * @param content
 */
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

/**
 * @param html
 * @param attr
 * @param pattern
 */
function removeElementsByAttrPattern(
  html: string,
  attr: string,
  pattern: RegExp,
): string {
  const openRe = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  let result = html;
  let match: null | RegExpExecArray;
  while ((match = openRe.exec(result)) !== null) {
    const attrValue = readAttrValue(match[2], attr);
    if (attrValue === null || !pattern.test(attrValue)) continue;

    const endIdx = findElementRemovalEndIndex(result, match);

    if (endIdx < 0) continue;
    result = result.slice(0, match.index) + result.slice(endIdx);
    openRe.lastIndex = match.index;
  }
  return result;
}

/**
 * @param html
 */
function stripEmptyListItems(html: string): string {
  return html.replace(
    /<li\b[^>]*>([\s\S]*?)<\/li>\s*/gi,
    (match, content: string) => (isEmptyInlineHtml(content) ? "" : match),
  );
}

/**
 * @param html
 */
function stripEmptyTagBlocks(html: string): string {
  return stripEmptyListItems(html).replace(
    /<(p|figure|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>\s*/gi,
    (match, tag: string, content: string) =>
      tag === "ul" || tag === "ol"
        ? hasOnlyEmptyListItems(content)
          ? ""
          : match
        : isEmptyInlineHtml(content)
          ? ""
          : match,
  );
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
 * @param rawHtml
 */
export function preCleanHtml(rawHtml: string): string {
  // MANDATORY: DOMPurify as first line of defense against XSS
  const purified = purifyRawHtml(rawHtml);

  let html = stripObviousNoiseBlocks(
    normalizeNoscriptForManipulation(purified),
  );

  html = removeElementsByAttrPattern(html, "id", NON_CONTENT_ID_RE);
  html = removeElementsByAttrPattern(html, "class", NON_CONTENT_CLASS_RE);
  html = stripBareLinkLists(html);

  return html.replace(
    /<aside\b[^>]*\bdata-nosnippet\b[^>]*>[\s\S]*?<\/aside>/gi,
    "",
  );
}

/**
 * @param html
 */
function stripBareLinkLists(html: string): string {
  return html.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (ulBlock) => {
    const items = [...ulBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    if (items.length === 0) return ulBlock;

    const allBareLinks = items.every((item) =>
      /^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test(item[1].trim()),
    );
    if (!allBareLinks) {
      return ulBlock;
    }

    return items.length >= 8 ||
      items.every((item) => SOCIAL_SHARE_LINK_RE.test(item[1]))
      ? ""
      : ulBlock;
  });
}

/**
 * @param html
 */
function stripObviousNoiseBlocks(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, "");
}
