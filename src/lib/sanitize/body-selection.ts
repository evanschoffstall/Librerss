/**
 * Article body container selection — finds the primary content container
 * in pre-cleaned HTML using semantic selectors and common CMS patterns.
 *
 * Pure HTML selection logic with no sanitization or I/O.
 */

/**
 * CSS class/id patterns that indicate an article body container.
 * Ordered by specificity — more precise patterns first.
 */
const CONTENT_CLASS_PATTERNS = [
  "article-content",
  "article-body",
  "article__body",
  "article__content",
  "entry-content",
  "entry__content",
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
] as const;

function extractInnerHtml(
  html: string,
  startIdx: number,
  openTagLength: number,
  tagName: string,
): string | null {
  const afterOpen = startIdx + openTagLength;
  const closeRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  closeRe.lastIndex = afterOpen;
  let depth = 1;
  let endIdx = -1;
  let m: RegExpExecArray | null;
  while (depth > 0 && (m = closeRe.exec(html)) !== null) {
    if (m[0].startsWith("</")) depth--;
    else depth++;
    if (depth === 0) endIdx = m.index;
  }
  return endIdx >= 0 ? html.slice(afterOpen, endIdx) : null;
}

function findAllByTag(html: string, tagName: string): string[] {
  const results: string[] = [];
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let openMatch: RegExpExecArray | null;
  while ((openMatch = openRe.exec(html)) !== null) {
    const inner = extractInnerHtml(
      html,
      openMatch.index,
      openMatch[0].length,
      tagName,
    );
    if (inner !== null) results.push(inner);
  }
  return results;
}

function findFirstByAttr(
  html: string,
  attr: string,
  value: string,
): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<([a-z][a-z0-9:-]*)\\b[^>]*\\b${attr}=["']${escaped}["'][^>]*>`,
    "i",
  );
  const match = re.exec(html);
  if (!match?.[1]) return null;
  return extractInnerHtml(html, match.index, match[0].length, match[1]);
}

function findFirstByClassContains(
  html: string,
  patterns: readonly string[],
  minLength: number,
): string | null {
  for (const pattern of patterns) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match only when the pattern is a standalone class token or a BEM block
    // (followed by `--` modifier).  Prevents `article-body` from matching
    // inside `sdc-article-body-width-limiter` where `-` creates a \b boundary
    // but the token continues with more dash-words.
    const re = new RegExp(
      `<([a-z][a-z0-9:-]*)\\b[^>]*(?:class|id)=["'][^"']*(?:^|\\s)${escaped}(?:\\s|--|$)[^"']*["'][^>]*>`,
      "i",
    );
    const match = re.exec(html);
    if (!match?.[1]) continue;
    const content = extractInnerHtml(
      html,
      match.index,
      match[0].length,
      match[1],
    );
    if (content && content.trim().length >= minLength) return content;
  }
  return null;
}

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
): string | null {
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

/**
 * Extract a page title from HTML via og:title, first `<h1>`, or `<title>`.
 */
export function extractPageTitle(html: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const propMatch = tag.match(
      /property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    );
    if (propMatch?.[1]) return propMatch[1];
    const reverseMatch = tag.match(
      /content=["']([^"']+)["'][^>]*property=["']og:title["']/i,
    );
    if (reverseMatch?.[1]) return reverseMatch[1];
  }

  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const text = h1[1].replace(/<[^>]*>/g, "").trim();
    if (text) return text;
  }

  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) {
    const text = titleTag[1].replace(/<[^>]*>/g, "").trim();
    if (text) return text;
  }
  return null;
}
