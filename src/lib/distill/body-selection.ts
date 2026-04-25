/**
 * Article body selection — locates the main content container in pre-cleaned
 * HTML using semantic selectors and common CMS class/id patterns.
 *
 * Extracted from `sanitize/content-validation.ts` to decouple body-finding
 * (a distillation concern) from HTML formatting (a sanitize concern).
 */

import { readAttrValue } from "@/lib/sanitize";

/** Content-indicative CSS class/id patterns ordered by specificity. */
const CONTENT_CLASS_PATTERNS = [
  "article-content",
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
 * Process the find article body.
 * @param html - The html.
 * @param minLength - The min length value.
 * @returns The find article body.
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
 * Process the class or id contains.
 * @param attrsStr - The attrs str.
 * @param segment - The segment.
 * @returns Whether class or id contains.
 */
function classOrIdContains(attrsStr: string, segment: string): boolean {
  const classVal = readAttrValue(attrsStr, "class") ?? "";
  const idVal = readAttrValue(attrsStr, "id") ?? "";
  return segmentMatch(classVal, segment) || segmentMatch(idVal, segment);
}

/**
 * Process the extract inner html.
 * @param html - The html.
 * @param startIdx - The start idx.
 * @param openTagLength - The open tag length value.
 * @param tagName - The tag name.
 * @returns The extract inner html.
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
 * Process the find all by tag.
 * @param html - The html.
 * @param tagName - The tag name.
 * @returns The find all by tag.
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
 * Process the find first by attr.
 * @param html - The html.
 * @param attr - The attr.
 * @param value - The value.
 * @returns The find first by attr.
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
    return extractInnerHtml(html, m.index, m[0].length, m[1]);
  }
  return null;
}

/**
 * Process the find first by class contains.
 * @param html - The html.
 * @param patterns - The patterns.
 * @param minLength - The min length value.
 * @returns The find first by class contains.
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
      if (content && content.trim().length >= minLength) return content;
    }
  }
  return null;
}

/**
 * Process the find largest tag body.
 * @param html - The html.
 * @param tagName - The tag name.
 * @param minLength - The min length value.
 * @returns The find largest tag body.
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
 * Process the meets min length.
 * @param value - The value.
 * @param minLength - The min length value.
 * @returns Whether meets min length.
 */
function meetsMinLength(
  value: null | string,
  minLength: number,
): value is string {
  return value !== null && value.trim().length >= minLength;
}

/**
 * Process the segment match.
 * @param attrValue - The attr value.
 * @param segment - The segment.
 * @returns Whether segment match.
 */
function segmentMatch(attrValue: string, segment: string): boolean {
  let start = 0;
  while (start <= attrValue.length - segment.length) {
    const idx = attrValue.indexOf(segment, start);
    if (idx < 0) return false;
    const leftOk = idx === 0 || /\s/.test(attrValue[idx - 1]);
    const end = idx + segment.length;
    const rightOk =
      end >= attrValue.length ||
      /\s/.test(attrValue[end]) ||
      attrValue.startsWith("--", end);
    if (leftOk && rightOk) return true;
    start = idx + 1;
  }
  return false;
}
