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
 * Find the article body container in pre-cleaned HTML.
 * Tries semantic selectors and common CMS class patterns in priority order:
 *
 * 1. `itemprop="articleBody"` (schema.org)
 * 2. Content-indicative CSS class/id patterns
 * 3. `<article>` elements (largest by content length)
 * 4. `role="main"` / `role="article"` attributes
 * 5. `<main>` elements (largest by content length)
 */
export function findArticleBody(
  html: string,
  minLength: number,
): null | string {
  let body = findFirstByAttr(html, "itemprop", "articleBody");
  if (body && body.trim().length >= minLength) return body;

  body = findFirstByClassContains(html, CONTENT_CLASS_PATTERNS, minLength);
  if (body) return body;

  const articles = findAllByTag(html, "article");
  if (articles.length > 0) {
    body = articles.reduce((a, b) => (a.length >= b.length ? a : b));
    if (body.trim().length >= minLength) return body;
  }

  for (const role of ["main", "article"] as const) {
    body = findFirstByAttr(html, "role", role);
    if (body && body.trim().length >= minLength) return body;
  }

  const mains = findAllByTag(html, "main");
  if (mains.length > 0) {
    body = mains.reduce((a, b) => (a.length >= b.length ? a : b));
    if (body.trim().length >= minLength) return body;
  }

  return null;
}

function classOrIdContains(attrsStr: string, segment: string): boolean {
  const classVal = readAttrValue(attrsStr, "class") ?? "";
  const idVal = readAttrValue(attrsStr, "id") ?? "";
  return segmentMatch(classVal, segment) || segmentMatch(idVal, segment);
}

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
    if (m[1]?.toLowerCase() !== lowerTag) continue;
    if (m[0].startsWith("</")) depth--;
    else depth++;
    if (depth === 0) return html.slice(afterOpen, m.index);
  }
  return null;
}

function findAllByTag(html: string, tagName: string): string[] {
  const results: string[] = [];
  const lowerTag = tagName.toLowerCase();
  const re = /<([a-z][a-z0-9:-]*)\b[^>]*>/gi;
  let m: null | RegExpExecArray;
  while ((m = re.exec(html)) !== null) {
    if (m[1]?.toLowerCase() !== lowerTag) continue;
    const inner = extractInnerHtml(html, m.index, m[0].length, tagName);
    if (inner !== null) results.push(inner);
  }
  return results;
}

function findFirstByAttr(
  html: string,
  attr: string,
  value: string,
): null | string {
  const re = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  let m: null | RegExpExecArray;
  while ((m = re.exec(html)) !== null) {
    if (readAttrValue(m[2] ?? "", attr) !== value) continue;
    return extractInnerHtml(html, m.index, m[0].length, m[1]);
  }
  return null;
}

function findFirstByClassContains(
  html: string,
  patterns: readonly string[],
  minLength: number,
): null | string {
  for (const pattern of patterns) {
    const re = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
    let m: null | RegExpExecArray;
    while ((m = re.exec(html)) !== null) {
      if (!classOrIdContains(m[2] ?? "", pattern)) continue;
      const content = extractInnerHtml(html, m.index, m[0].length, m[1]);
      if (content && content.trim().length >= minLength) return content;
    }
  }
  return null;
}

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
