/**
 * Article body selection — locates the main content container in pre-cleaned
 * HTML using semantic selectors and common CMS class/id patterns.
 *
 * Extracted from `sanitize/content-validation.ts` to decouple body-finding
 * (a distillation concern) from HTML formatting (a sanitize concern).
 */

import { prependNearbyLeadImage } from "@/lib/distill/lead";
import { readAttrValue } from "@/lib/sanitize";

/** Content-indicative CSS class/id patterns ordered by specificity. */
const CONTENT_CLASS_PATTERNS = [
  "article-content",
  "articlebody",
  "article-body",
  "article__body",
  "article__content",
  "entry-content",
  "entry__content",
  "entry-body",
  "post-content",
  "post-body",
  "post__content",
  "post__body",
  "story-content",
  "story__content",
  "story-body",
  "story__body",
  "story__text",
  "amp-wp-article-content",
  "content-body",
  "blog-post-content",
  "page-content",
  "wp-block-post-content",
  "the-content",
  "rich-text",
  "field-name-body",
  "field--name-body",
  "article-text",
  "post-text",
] as const;

/**
 * Finds the first trustworthy article body using high-signal semantic markers
 * before falling back to larger generic containers. Selector order is
 * intentionally conservative because sponsored modules often reuse broad class
 * names such as `article-body` for callout copy.
 * @param html - Pre-cleaned document HTML to inspect.
 * @param minLength - Minimum raw fragment length required for a selected body.
 * @returns Selected body HTML, or null when no candidate is strong enough.
 */
export function findArticleBody(
  html: string,
  minLength: number,
): null | string {
  const schemaBody = findFirstByAttr(html, "itemprop", "articleBody");
  if (meetsMinLength(schemaBody, minLength)) {
    return schemaBody;
  }

  const body = findFirstByClassContains(
    html,
    CONTENT_CLASS_PATTERNS,
    minLength,
  );
  if (body) return body;

  const articleBody = findLargestTagBody(html, "article", minLength);
  if (articleBody) {
    return articleBody;
  }

  for (const role of ["main", "article"] as const) {
    const roleBody = findFirstByAttr(html, "role", role);
    if (meetsMinLength(roleBody, minLength)) {
      return roleBody;
    }
  }

  return findLargestTagBody(html, "main", minLength);
}

/**
 * Checks class and id attributes for a content marker while tolerating publisher
 * casing differences such as `articleBody` versus `articlebody`.
 * @param attrsStr - Raw opening-tag attribute string.
 * @param segment - Class or id segment to match exactly.
 * @returns Whether either attribute contains the requested segment.
 */
function classOrIdContains(attrsStr: string, segment: string): boolean {
  const classVal = readAttrValue(attrsStr, "class") ?? "";
  const idVal = readAttrValue(attrsStr, "id") ?? "";
  return segmentMatch(classVal, segment) || segmentMatch(idVal, segment);
}

/**
 * Extracts a balanced element body from an opening tag position.
 * @param html - Source HTML containing the container.
 * @param startIdx - Index of the opening tag in the source HTML.
 * @param openTagLength - Length of the opening tag text.
 * @param tagName - Container tag name whose matching close tag ends the body.
 * @returns Inner HTML for the balanced element, or null for malformed markup.
 */
function extractInnerHtml(
  html: string,
  startIdx: number,
  openTagLength: number,
  tagName: string,
): null | string {
  const afterOpen = startIdx + openTagLength;
  const lowerTag = tagName.toLowerCase();
  const re = /<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi;
  re.lastIndex = afterOpen;
  let depth = 1;
  let m: null | RegExpExecArray;
  while (depth > 0 && (m = re.exec(html)) !== null) {
    if (m[1].toLowerCase() !== lowerTag) continue;
    if (m[0].startsWith("</")) depth--;
    else depth++;
    if (depth === 0) return html.slice(afterOpen, m.index);
  }
  return null;
}

/**
 * Finds all balanced bodies for a tag so generic container fallback can choose
 * the broadest article-shaped region.
 * @param html - Source HTML to inspect.
 * @param tagName - Tag name to collect.
 * @returns Inner HTML fragments for each balanced matching element.
 */
function findAllByTag(html: string, tagName: string): string[] {
  const results: string[] = [];
  const lowerTag = tagName.toLowerCase();
  const re = /<([a-z][a-z0-9:-]*)\b[^>]*>/gi;
  let m: null | RegExpExecArray;
  while ((m = re.exec(html)) !== null) {
    if (m[1].toLowerCase() !== lowerTag) continue;
    const inner = extractInnerHtml(html, m.index, m[0].length, tagName);
    if (inner !== null) results.push(inner);
  }
  return results;
}

/**
 * Finds the first element with an exact attribute value, preserving nearby lead
 * media when the selected body itself does not already begin with media.
 * @param html - Source HTML to inspect.
 * @param attr - Attribute name to match.
 * @param value - Exact attribute value required for selection.
 * @returns Selected body HTML, or null when no balanced match exists.
 */
function findFirstByAttr(
  html: string,
  attr: string,
  value: string,
): null | string {
  const re = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  let m: null | RegExpExecArray;
  while ((m = re.exec(html)) !== null) {
    if (readAttrValue(m[2], attr) !== value) continue;
    const innerHtml = extractInnerHtml(html, m.index, m[0].length, m[1]);
    return innerHtml === null
      ? null
      : prependNearbyLeadImage(html, innerHtml, m.index);
  }
  return null;
}

/**
 * Finds the first class/id body matching the ordered content patterns. Pattern
 * order carries meaning: high-confidence article-body variants run before
 * broader CMS body markers that can appear inside unrelated modules.
 * @param html - Source HTML to inspect.
 * @param patterns - Ordered class/id markers that indicate article content.
 * @param minLength - Minimum raw fragment length required for selection.
 * @returns Selected body HTML, or null when no candidate is long enough.
 */
function findFirstByClassContains(
  html: string,
  patterns: readonly string[],
  minLength: number,
): null | string {
  for (const pattern of patterns) {
    const re = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
    let m: null | RegExpExecArray;
    while ((m = re.exec(html)) !== null) {
      if (!classOrIdContains(m[2], pattern)) continue;
      const content = extractInnerHtml(html, m.index, m[0].length, m[1]);
      if (content && content.trim().length >= minLength) {
        return prependNearbyLeadImage(html, content, m.index);
      }
    }
  }
  return null;
}

/**
 * Selects the largest balanced generic container as a last resort.
 * @param html - Source HTML to inspect.
 * @param tagName - Generic container tag name such as `article` or `main`.
 * @param minLength - Minimum raw fragment length required for selection.
 * @returns Largest matching body HTML, or null when none is long enough.
 */
function findLargestTagBody(
  html: string,
  tagName: string,
  minLength: number,
): null | string {
  const matches = findAllByTag(html, tagName);
  const largestMatch = matches.reduce<null | string>(
    (largest, candidate) =>
      largest === null || candidate.length > largest.length
        ? candidate
        : largest,
    null,
  );

  return meetsMinLength(largestMatch, minLength) ? largestMatch : null;
}

/**
 * Checks whether a candidate has enough raw content to avoid tiny navigation,
 * teaser, or CTA fragments.
 * @param value - Candidate body HTML.
 * @param minLength - Minimum trimmed character count required.
 * @returns Whether the candidate is non-null and long enough.
 */
function meetsMinLength(
  value: null | string,
  minLength: number,
): value is string {
  return value !== null && value.trim().length >= minLength;
}

/**
 * Matches a class/id token without allowing partial words to satisfy the
 * selector. This keeps broad patterns from matching unrelated BEM modifiers
 * while still allowing exact camel-case tokens after normalization.
 * @param attrValue - Raw class or id attribute value.
 * @param segment - Lowercase selector segment to find.
 * @returns Whether the normalized attribute contains the segment as a token.
 */
function segmentMatch(attrValue: string, segment: string): boolean {
  const normalizedAttrValue = attrValue.toLowerCase();
  const normalizedSegment = segment.toLowerCase();
  let start = 0;
  while (start <= normalizedAttrValue.length - normalizedSegment.length) {
    const idx = normalizedAttrValue.indexOf(normalizedSegment, start);
    if (idx < 0) return false;
    const leftOk = idx === 0 || /\s/.test(normalizedAttrValue[idx - 1]);
    const end = idx + normalizedSegment.length;
    const rightOk =
      end >= normalizedAttrValue.length ||
      /\s/.test(normalizedAttrValue[end]) ||
      normalizedAttrValue.startsWith("--", end);
    if (leftOk && rightOk) return true;
    start = idx + 1;
  }
  return false;
}
