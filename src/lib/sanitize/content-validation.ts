import { logger } from "@/lib/logger";
import {
  normalizeArticleHtmlSpacing,
  SOCIAL_SHARE_LINK_RE,
  toPlainText,
} from "./cleaners";
import { extractAttrValue } from "./patterns";

function contentPreview(s: string, max = 200): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function isSocialShareListItem(li: string): boolean {
  const lower = li.toLowerCase();
  if (SOCIAL_SHARE_LINK_RE.test(lower)) return true;
  const text = lower
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(copy\s*link|facebook|twitter|whatsapp|reddit|x|email|linkedin|flipboard|pinterest)$/i.test(
    text,
  );
}

function stripShareEngagementToolbars(content: string): string {
  return content.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (ulBlock) => {
    const items = [...ulBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    if (items.length === 0) return ulBlock;
    const socialCount = items.filter((m) =>
      isSocialShareListItem(m[1] ?? ""),
    ).length;
    if (socialCount >= 2 && socialCount >= items.length / 2) return "";

    const lower = ulBlock.toLowerCase();
    if (!SOCIAL_SHARE_LINK_RE.test(lower)) return ulBlock;
    const textContent = lower.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    return /\bshare\b|\bsave\s*for\s*later\b|\bcomment\b|\blisten\b/i.test(
      textContent,
    )
      ? ""
      : ulBlock;
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

  // Long prose bodies are not boilerplate even if they contain footer keywords.
  const plainTextLength = toPlainText(content)
    .replace(/\s+/g, " ")
    .trim().length;
  if (plainTextLength > 2000) return false;

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
  if (!sanitizedContent.trim()) {
    logger.info(`[clean-html] input empty, returning ""`);
    return "";
  }

  logger.info(`[clean-html] start`, {
    inputChars: sanitizedContent.length,
    inputPreview: contentPreview(sanitizedContent),
  });

  const withoutShareToolbars = stripShareEngagementToolbars(sanitizedContent);
  const shareToolbarsRemoved =
    withoutShareToolbars.length !== sanitizedContent.length;
  if (shareToolbarsRemoved) {
    logger.info(`[clean-html] stripped share/engagement toolbars`, {
      removedChars: sanitizedContent.length - withoutShareToolbars.length,
    });
  }

  const withoutEngagementPrompts =
    stripCommentEngagementBoilerplate(withoutShareToolbars);
  const engagementRemoved =
    withoutEngagementPrompts.length !== withoutShareToolbars.length;
  if (engagementRemoved) {
    logger.info(`[clean-html] stripped comment/engagement boilerplate`, {
      removedChars:
        withoutShareToolbars.length - withoutEngagementPrompts.length,
    });
  }

  const normalized = normalizeArticleHtmlSpacing(withoutEngagementPrompts);

  if (!normalized.trim()) {
    logger.info(`[clean-html] content empty after normalization`);
    return "";
  }

  if (isLikelyNavFooterBoilerplate(normalized)) {
    logger.info(`[clean-html] detected nav/footer boilerplate — discarding`, {
      normalizedChars: normalized.length,
      contentPreview: contentPreview(normalized),
    });
    return "";
  }

  logger.info(`[clean-html] done`, {
    outputChars: normalized.length,
    outputPreview: contentPreview(normalized),
  });
  return normalized;
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
  const lowerTag = tagName.toLowerCase();
  const re = /<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi;
  re.lastIndex = afterOpen;
  let depth = 1;
  let m: RegExpExecArray | null;
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
  let m: RegExpExecArray | null;
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
): string | null {
  const re = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (extractAttrValue(m[2] ?? "", attr) !== value) continue;
    return extractInnerHtml(html, m.index, m[0].length, m[1]!);
  }
  return null;
}

function classOrIdContains(attrsStr: string, segment: string): boolean {
  const classVal = extractAttrValue(attrsStr, "class") ?? "";
  const idVal = extractAttrValue(attrsStr, "id") ?? "";
  return segmentMatch(classVal, segment) || segmentMatch(idVal, segment);
}

function segmentMatch(attrValue: string, segment: string): boolean {
  let start = 0;
  while (start <= attrValue.length - segment.length) {
    const idx = attrValue.indexOf(segment, start);
    if (idx < 0) return false;
    const leftOk = idx === 0 || /\s/.test(attrValue[idx - 1]!);
    const end = idx + segment.length;
    const rightOk =
      end >= attrValue.length ||
      /\s/.test(attrValue[end]!) ||
      attrValue.startsWith("--", end);
    if (leftOk && rightOk) return true;
    start = idx + 1;
  }
  return false;
}

function findFirstByClassContains(
  html: string,
  patterns: readonly string[],
  minLength: number,
): string | null {
  for (const pattern of patterns) {
    const re = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (!classOrIdContains(m[2] ?? "", pattern)) continue;
      const content = extractInnerHtml(html, m.index, m[0].length, m[1]!);
      if (content && content.trim().length >= minLength) return content;
    }
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
  logger.info(`[find-body] searching for article body container`, {
    htmlChars: html.length,
    minLength,
  });

  let body = findFirstByAttr(html, "itemprop", "articleBody");
  if (body && body.trim().length >= minLength) {
    logger.info(`[find-body] matched itemprop="articleBody"`, {
      bodyChars: body.length,
    });
    return body;
  }

  body = findFirstByClassContains(html, CONTENT_CLASS_PATTERNS, minLength);
  if (body) {
    logger.info(`[find-body] matched content class pattern`, {
      bodyChars: body.length,
    });
    return body;
  }

  const articles = findAllByTag(html, "article");
  if (articles.length > 0) {
    body = articles.reduce((a, b) => (a.length >= b.length ? a : b));
    if (body.trim().length >= minLength) {
      logger.info(
        `[find-body] matched <article> tag (largest of ${articles.length})`,
        { bodyChars: body.length },
      );
      return body;
    }
  }

  for (const role of ["main", "article"] as const) {
    body = findFirstByAttr(html, "role", role);
    if (body && body.trim().length >= minLength) {
      logger.info(`[find-body] matched role="${role}"`, {
        bodyChars: body.length,
      });
      return body;
    }
  }

  const mains = findAllByTag(html, "main");
  if (mains.length > 0) {
    body = mains.reduce((a, b) => (a.length >= b.length ? a : b));
    if (body.trim().length >= minLength) {
      logger.info(
        `[find-body] matched <main> tag (largest of ${mains.length})`,
        { bodyChars: body.length },
      );
      return body;
    }
  }

  logger.info(`[find-body] no suitable container found`);
  return null;
}
