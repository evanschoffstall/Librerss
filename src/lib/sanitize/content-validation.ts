import { normalizeArticleHtmlSpacing, toPlainText } from "./cleaners";

function stripShareEngagementToolbars(content: string): string {
  return content.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (ulBlock) => {
    const lower = ulBlock.toLowerCase();
    const hasSocialShareLink =
      /twitter\.com\/share|facebook\.com\/sharer|reddit\.com\/submit|linkedin\.com\/sharearticle|api\.whatsapp\.com\/send|intent\/tweet|mailto:\?/i.test(
        lower,
      );
    if (!hasSocialShareLink) return ulBlock;

    const textContent = lower.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const hasEngagementLabel =
      /\bshare\b|\bsave\s*for\s*later\b|\bcomment\b|\blisten\b/i.test(
        textContent,
      );
    return hasEngagementLabel ? "" : ulBlock;
  });
}

export function stripCommentEngagementBoilerplate(content: string): string {
  return content
    .replace(/<p\b[^>]*>([^<]{0,300})<\/p>/gi, (match, text: string) => {
      const lower = text.toLowerCase();
      const hasLoginSignal =
        /(log\s*(?:in|out)|sign\s*(?:in|out)|display\s*name|before\s+commenting|to\s+comment|must\s+confirm|will\s+be\s+prompted)/.test(
          lower,
        );
      return hasLoginSignal ? "" : match;
    })
    .trim();
}

/**
 * Returns true when the sanitized content looks like site navigation or footer
 * boilerplate rather than an article body.  Detection is purely heuristic:
 * it requires at least 2 known site-chrome keyword markers ("privacy",
 * "advertise", "subscribe", etc.) AND a high link + list-item density.  All
 * three conditions must hold to avoid false positives on article content that
 * legitimately mentions those words.
 */
export function isLikelyNavFooterBoilerplate(content: string): boolean {
  const lower = content.toLowerCase();
  const markerHits = [
    "privacy",
    "terms",
    "subscribe",
    "masthead",
    "copyright",
    "© ",
    "newsletter",
    "advertise",
    "contact",
    "sitemap",
    "rules of the road",
  ].filter((m) => lower.includes(m)).length;

  const linkCount = (content.match(/<a\b/gi) ?? []).length;
  const listItemCount = (content.match(/<li\b/gi) ?? []).length;

  // Require all three signals to fire together to avoid false positives.
  return markerHits >= 2 && linkCount >= 6 && listItemCount >= 4;
}

/**
 * Returns true when the content appears to contain a real article body worth
 * showing to the user.  Two independent signals are tried in order:
 *
 * 1. Structural check — 2+ block-level elements (p, headings, blockquote, list)
 *    strongly suggest formatted article prose.
 * 2. Plain-text length check — ≥280 chars of prose (≈2 sentences) as a fallback
 *    for pages that use only inline markup with no block containers.
 *
 * Used by the direct-sanitize fallback to avoid promoting ad fragments or
 * empty boilerplate into the article slot.
 */
export function hasReadableArticleBody(content: string): boolean {
  // Prefer structured markup as the primary signal — fast and reliable.
  const blockElementCount = (
    content.match(/<(?:p|h[1-6]|blockquote|ul|ol)\b/gi) ?? []
  ).length;
  if (blockElementCount >= 2) return true;

  // Fall back to raw text length for pages with minimal HTML structure.
  const plainTextLength = toPlainText(content)
    .replace(/\s+/g, " ")
    .trim().length;
  return plainTextLength >= 280;
}

/**
 * Final clean-up pass applied to sanitized article HTML before it is stored
 * or returned to the client.  Two things are removed in sequence:
 *
 * 1. Comment-engagement boilerplate — login prompts, "before commenting"
 *    notices, etc. that extractors sometimes pull in from the comment section.
 * 2. Nav/footer boilerplate guard — if the whole remaining content still looks
 *    like site chrome (high link density + site-chrome keywords), discard it
 *    entirely so the caller can fall through to a better fallback.
 *
 * `_articleUrl` is reserved for future per-origin cleaning rules but is
 * intentionally unused today to keep the logic domain-agnostic.
 */
export function cleanExtractedArticleHtml(
  sanitizedContent: string,
  _articleUrl: string,
): string {
  if (!sanitizedContent.trim()) return "";

  const withoutShareToolbars = stripShareEngagementToolbars(sanitizedContent);
  const withoutEngagementPrompts =
    stripCommentEngagementBoilerplate(withoutShareToolbars);
  const normalized = normalizeArticleHtmlSpacing(withoutEngagementPrompts);

  if (!normalized.trim()) return "";

  // Discard entirely if the content still looks like a nav/footer block.
  return isLikelyNavFooterBoilerplate(normalized) ? "" : normalized;
}

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
    const re = new RegExp(
      `<([a-z][a-z0-9:-]*)\\b[^>]*(?:class|id)=["'][^"']*(?:(?<=["'])|\\s)${escaped}(?:\\s|--|(?=["']))[^"']*["'][^>]*>`,
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
