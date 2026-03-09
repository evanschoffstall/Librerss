import {
  normalizeArticleHtmlSpacing,
  SOCIAL_SHARE_LINK_RE,
  toPlainText,
} from "./cleaners";
import { manipulateAttrValue } from "./patterns";

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

    // Strip sidebar-style nav lists where every item is a single bare link
    const allBareLinks =
      items.length >= 2 &&
      items.length <= 6 &&
      items.every((m) =>
        /^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test((m[1] ?? "").trim()),
      );
    if (allBareLinks) return "";

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

/**
 * Known file extensions that appear in download-widget size descriptors
 * such as "JPEG (82.95 KB)" or "MOV (3.33 MB)".
 */
const FILE_DOWNLOAD_EXTENSIONS = new Set([
  "jpeg",
  "jpg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tif",
  "tiff",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "mp3",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "ogg",
  "wav",
  "flac",
  "zip",
  "tar",
  "gz",
  "7z",
  "rar",
  "json",
  "xml",
  "csv",
  "txt",
]);
/** Anchored, non-backtracking: extension + whitespace + parenthesised size. */
const FILE_SIZE_SUFFIX_RE = /^([a-z0-9]{2,5})\s*\(\d[\d.]*\s*[KMGT]?B\)$/i;

function isFileTypeSizeText(text: string): boolean {
  const m = FILE_SIZE_SUFFIX_RE.exec(text);
  return m !== null && FILE_DOWNLOAD_EXTENSIONS.has(m[1]!.toLowerCase());
}

function stripFileDownloadBoilerplate(content: string): string {
  return content.replace(
    /<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    (match, inner: string) =>
      isFileTypeSizeText(inner.replace(/<[^>]*>/g, "").trim()) ? "" : match,
  );
}

function normalizeHeadingText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isShortHeadingLabel(text: string): boolean {
  const normalized = text.trim();
  if (!normalized || normalized.length > 72) return false;
  if (/[.!?;:]/.test(normalized)) return false;
  return normalized.split(/\s+/).filter(Boolean).length <= 6;
}

const LEADING_WHITESPACE_RE = /^\s+/;
const LEADING_ANCHOR_OPEN_RE = /^<a\b[^>]*>\s*/i;
const LEADING_IMAGE_RE = /^<img\b[^>]*\/?>(?:\s*)/i;
const LEADING_ANCHOR_CLOSE_RE = /^<\/a>\s*/i;
const LEADING_HEADING_RE = /^<h[2-4]\b[^>]*>[\s\S]*?<\/h[2-4]>\s*/i;

function consumeLeadingToken(source: string, tokenRe: RegExp): string {
  return tokenRe.exec(source)?.[0] ?? "";
}

function parseLeadMediaAndHeadingPrefix(content: string): {
  imagePrefix: string;
  headingBlock: string;
  consumedLength: number;
} {
  let cursor = 0;
  let imagePrefix = "";
  let headingBlock = "";

  const leadingWhitespace = consumeLeadingToken(
    content.slice(cursor),
    LEADING_WHITESPACE_RE,
  );
  imagePrefix += leadingWhitespace;
  cursor += leadingWhitespace.length;

  while (true) {
    const beforeImage = cursor;
    let segment = "";

    const anchorOpen = consumeLeadingToken(
      content.slice(cursor),
      LEADING_ANCHOR_OPEN_RE,
    );
    if (anchorOpen) {
      segment += anchorOpen;
      cursor += anchorOpen.length;
    }

    const imageTag = consumeLeadingToken(
      content.slice(cursor),
      LEADING_IMAGE_RE,
    );
    if (!imageTag) {
      cursor = beforeImage;
      break;
    }
    segment += imageTag;
    cursor += imageTag.length;

    if (anchorOpen) {
      const anchorClose = consumeLeadingToken(
        content.slice(cursor),
        LEADING_ANCHOR_CLOSE_RE,
      );
      if (anchorClose) {
        segment += anchorClose;
        cursor += anchorClose.length;
      }
    }

    imagePrefix += segment;
  }

  while (true) {
    const heading = consumeLeadingToken(
      content.slice(cursor),
      LEADING_HEADING_RE,
    );
    if (!heading) break;
    headingBlock += heading;
    cursor += heading.length;
  }

  return { imagePrefix, headingBlock, consumedLength: cursor };
}

function stripLeadMediaBoilerplateHeadings(content: string): string {
  const { imagePrefix, headingBlock, consumedLength } =
    parseLeadMediaAndHeadingPrefix(content);
  if (!headingBlock) return content;

  const headings =
    headingBlock.match(/<h[2-4]\b[^>]*>[\s\S]*?<\/h[2-4]>/gi) ?? [];
  if (headings.length === 0) return content;

  // Strip only clear heading clusters, not standalone semantic headings.
  if (
    headings.length < 2 ||
    !headings.every((heading) =>
      isShortHeadingLabel(normalizeHeadingText(heading)),
    )
  ) {
    return content;
  }

  return normalizeArticleHtmlSpacing(
    [imagePrefix, content.slice(consumedLength)].filter(Boolean).join("\n"),
  );
}

function readFirstImageSource(content: string): string {
  const { imagePrefix } = parseLeadMediaAndHeadingPrefix(content);
  const imageTag = imagePrefix.match(/<img\b[^>]*>/i)?.[0];
  if (!imageTag) return "";
  const srcMatch = imageTag.match(/\bsrc=["']([^"']+)["']/i);
  return (srcMatch?.[1] ?? "").trim();
}

function normalizeImageSource(source: string): string {
  const normalized = source.trim().replace(/&amp;/g, "&");
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return normalized.split(/[?#]/, 1)[0] ?? "";
  }
}

function removeLeadingDuplicateImage(content: string): string {
  const { imagePrefix } = parseLeadMediaAndHeadingPrefix(content);
  if (!imagePrefix.trim()) return content;

  const firstSrc = normalizeImageSource(readFirstImageSource(content));
  if (!firstSrc) return content;

  const afterLeadImage = content.slice(imagePrefix.length);

  const imageSrcMatches = [
    ...afterLeadImage.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi),
  ].map((match) => normalizeImageSource(match[1] ?? ""));

  const hasDuplicateImageSource = imageSrcMatches.includes(firstSrc);
  if (!hasDuplicateImageSource) return content;

  return normalizeArticleHtmlSpacing(afterLeadImage);
}

/** Promotional / call-to-action pattern (cross-site generic). */
const PROMO_CTA_RE =
  /add\s+as\s+preferred\s+source|follow\s+\S+\s+on\s+whatsapp|you\s+need\s+javascript\s+enabled|you\s+may\s+like\s+to\s+watch|essential\s+reads|preferred\s+source\s+on\s+google|reader[-\s]supported\s+publication|to\s+receive\s+new\s+posts|consider\s+becoming\s+a\s+subscriber/i;

function isPromoCta(inner: string): boolean {
  const text = inner
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return PROMO_CTA_RE.test(text);
}

/**
 * Strip promotional CTA paragraphs and links (e.g. "Add as preferred source on
 * Google", "Follow X on WhatsApp", "You need javascript enabled").
 */
function stripPromotionalCtaBlocks(content: string): string {
  return content
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (m, inner: string) =>
      isPromoCta(inner) ? "" : m,
    )
    .replace(
      // eslint-disable-next-line security/detect-unsafe-regex -- Pre-sanitized HTML input; lazy quantifiers prevent excessive backtracking
      /(?:<br\s*\/?>\s*)*<a\b[^>]*>([\s\S]*?)<\/a>(?:\s*<br\s*\/?>\s*)*/gi,
      (m, inner: string) => (isPromoCta(inner) ? "" : m),
    );
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
 *    notices, etc. that manipulators sometimes pull in from the comment section.
 * 2. Nav/footer boilerplate guard — if the whole remaining content still looks
 *    like site chrome (high link density + site-chrome keywords), discard it
 *    entirely so the caller can fall through to a better fallback.
 *
 * `_articleUrl` is reserved for future per-origin cleaning rules but is
 * intentionally unused today to keep the logic domain-agnostic.
 */
export function cleanSanitizedHtml(
  sanitizedContent: string,
  _articleUrl: string,
): string {
  if (!sanitizedContent.trim()) return "";

  // Check boilerplate on original input before stripping removes detection markers.
  if (isLikelyNavFooterBoilerplate(sanitizedContent)) {
    return "";
  }

  const withoutShareToolbars = stripShareEngagementToolbars(sanitizedContent);

  const withoutFileBoilerplate =
    stripFileDownloadBoilerplate(withoutShareToolbars);

  const withoutEngagementPrompts = stripCommentEngagementBoilerplate(
    withoutFileBoilerplate,
  );

  const withoutPromos = stripPromotionalCtaBlocks(withoutEngagementPrompts);

  const withoutDuplicateLeadImage = removeLeadingDuplicateImage(withoutPromos);

  const withoutMediaHeadings = stripLeadMediaBoilerplateHeadings(
    withoutDuplicateLeadImage,
  );

  const normalized = normalizeArticleHtmlSpacing(withoutMediaHeadings);

  if (!normalized.trim()) return "";

  if (isLikelyNavFooterBoilerplate(normalized)) {
    return "";
  }
  return normalized;
}

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
  // Drupal standard body field (used across all Drupal 7/8/9/10 sites)
  "field-name-body",
  "field--name-body",
  // Generic article text container used across various CMSes
  "article-text",
  "post-text",
] as const;

function manipulateInnerHtml(
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
    const inner = manipulateInnerHtml(html, m.index, m[0].length, tagName);
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
    if (manipulateAttrValue(m[2] ?? "", attr) !== value) continue;
    return manipulateInnerHtml(html, m.index, m[0].length, m[1]!);
  }
  return null;
}

function classOrIdContains(attrsStr: string, segment: string): boolean {
  const classVal = manipulateAttrValue(attrsStr, "class") ?? "";
  const idVal = manipulateAttrValue(attrsStr, "id") ?? "";
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
      const content = manipulateInnerHtml(html, m.index, m[0].length, m[1]!);
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
  let body = findFirstByAttr(html, "itemprop", "articleBody");
  if (body && body.trim().length >= minLength) {
    return body;
  }

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
