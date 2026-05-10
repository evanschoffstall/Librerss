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
 * Process the escape html attribute.
 * @param value - The value.
 * @returns The escape html attribute.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Normalize the article html spacing.
 * @param html - The html.
 * @returns The article html spacing.
 */
export function normalizeArticleHtmlSpacing(html: string): string {
  return stripEmptyTagBlocks(html)
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]*\n+/g, "\n")
    .replace(/>\s*\n\s*\n+\s*</g, ">\n<")
    .replace(/\.\s+\.(?=\s|<|$)/g, ".")
    .trim();
}

/**
 * Process the strip ap junk blocks.
 * @param html - The html.
 * @returns The strip ap junk blocks.
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
 * Process the strip empty anchors.
 * @param html - The html.
 * @returns The strip empty anchors.
 */
export function stripEmptyAnchors(html: string): string {
  return html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (match, inner: string) => {
    if (/<img\b/i.test(inner)) return match;
    return inner.replace(/<[^>]*>/g, "").trim().length === 0 ? "" : match;
  });
}

/**
 * Process the to paragraph html.
 * @param raw - The raw.
 * @returns The to paragraph html.
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
 * Process the find element removal end index.
 * @param html - The html.
 * @param openMatch - The open match.
 * @returns The find element removal end index.
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
 * Return whether has only empty list items.
 * @param content - The content.
 * @returns Whether has only empty list items.
 */
function hasOnlyEmptyListItems(content: string): boolean {
  const listItems = [...content.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  if (listItems.length === 0) return isEmptyInlineHtml(content);
  return listItems.every((item) => isEmptyInlineHtml(item[1]));
}

/**
 * Return whether is empty inline html.
 * @param content - The content.
 * @returns Whether is empty inline html.
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
 * Process the remove elements by attr pattern.
 * @param html - The html.
 * @param attr - The attr.
 * @param pattern - The pattern.
 * @returns The remove elements by attr pattern.
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
 * Process the strip empty list items.
 * @param html - The html.
 * @returns The strip empty list items.
 */
function stripEmptyListItems(html: string): string {
  return html.replace(
    /<li\b[^>]*>([\s\S]*?)<\/li>\s*/gi,
    (match, content: string) => (isEmptyInlineHtml(content) ? "" : match),
  );
}

/**
 * Process the strip empty tag blocks.
 * @param html - The html.
 * @returns The strip empty tag blocks.
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
  /article[-_]?callout|sign[-_]?up|subscrib(?:e[-_]?(?:widget|form|bar|banner|button|cta|prompt|modal|popup|overlay)|tion[-_]?(?:widget|form|bar|banner))|newsletter[-_]?(?:sign|sub|widget|form|bar|banner|popup|modal|overlay|cta|promo|prompt|optin)|social[-_]?share|share[-_]?(?:bar|tool|button|widget)|utility[-_]?bar|comments?[-_]?(?:container|widget|wrapper|area|form)|promo(?:tion)?[-_]?(?:bar|banner|block|card)|cta[-_](?:bar|banner|block)|call[-_]?to[-_]?action|follow[-_]?(?:us|bar)|whatsapp[-_]?(?:bar|link|share)/i;

/**
 * CSS class tokens used across all major frameworks to visually hide content
 * that is exclusively intended for screen readers. Elements whose class
 * attribute contains one of these as a standalone space-delimited token must
 * be stripped entirely, including their text, because their prose must never
 * appear as visible article content.
 *
 * Anchored with `(?:^|\s)` and `(?=\s|$)` rather than `\b` so that compound
 * Drupal BEM names such as `field--label-visually_hidden` are not matched —
 * those elements carry real content (images) that must be preserved.
 *
 * Covers: Bootstrap / Tailwind `sr-only`, WCAG `visually-hidden`,
 * WordPress `screen-reader-text`, Drupal `element-invisible`,
 * Foundation `show-for-sr`, and common variant spellings.
 */
const SCREEN_READER_ONLY_CLASS_RE =
  /(?:^|\s)(?:sr[-_]?only|visually[-_]?hidden|screen[-_]?reader[-_]?(?:text|only)?|element[-_]?(?:invisible|visually[-_]?hidden)|off[-_]?screen|show[-_]?for[-_]?sr)(?=\s|$)/i;

/** Generic share-intent URL patterns used across many share widgets. */
export const SOCIAL_SHARE_LINK_RE =
  /mailto:\?|\/(?:share|sharer|sharing|intent|submit|compose)\b|[?&](?:share|text|title|subject|body|url)=/i;

/**
 * Strips script/style noise, removes non-content containers identified by
 * semantic class or id patterns, and eliminates screen-reader-only elements
 * whose text must never surface as visible article prose. DOMPurify runs first
 * as the mandatory XSS boundary; all subsequent passes are structural.
 * @param rawHtml - Raw HTML fetched from the upstream publisher.
 * @returns Pre-cleaned HTML ready for distillation and article body selection.
 */
export function preCleanHtml(rawHtml: string): string {
  // MANDATORY: DOMPurify as first line of defense against XSS
  const purified = purifyRawHtml(rawHtml);

  let html = stripObviousNoiseBlocks(
    normalizeNoscriptForManipulation(purified),
  );

  html = removeElementsByAttrPattern(html, "id", NON_CONTENT_ID_RE);
  html = removeElementsByAttrPattern(html, "class", NON_CONTENT_CLASS_RE);
  // Strip screen-reader-only elements entirely so their hidden prose (labels
  // such as "opens in a new window" or "Image") never bleeds into extracted
  // article content after outer wrapper tags are stripped by sanitize-html.
  html = removeElementsByAttrPattern(
    html,
    "class",
    SCREEN_READER_ONLY_CLASS_RE,
  );
  html = stripBareLinkLists(html);

  return html.replace(
    /<aside\b[^>]*\bdata-nosnippet\b[^>]*>[\s\S]*?<\/aside>/gi,
    "",
  );
}

/**
 * Process the strip bare link lists.
 * @param html - The html.
 * @returns The strip bare link lists.
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
 * Process the strip obvious noise blocks.
 * @param html - The html.
 * @returns The strip obvious noise blocks.
 */
function stripObviousNoiseBlocks(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, "");
}
