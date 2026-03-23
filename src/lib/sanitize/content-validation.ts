import {
  normalizeArticleHtmlSpacing,
  SOCIAL_SHARE_LINK_RE,
  stripLeadingInlineBioBlock,
  toPlainText,
} from "./cleaners";

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
    const socialCount = items.filter((m) => isSocialShareListItem(m[1])).length;
    if (socialCount >= 2 && socialCount >= items.length / 2) return "";

    // Strip sidebar-style nav lists where every item is a single bare link
    const allBareLinks =
      items.length >= 2 &&
      items.length <= 6 &&
      items.every((m) => /^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test(m[1].trim()));
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
  "7z",
  "avi",
  "bmp",
  "csv",
  "doc",
  "docx",
  "flac",
  "gif",
  "gz",
  "jpeg",
  "jpg",
  "json",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "ogg",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "rar",
  "svg",
  "tar",
  "tif",
  "tiff",
  "txt",
  "wav",
  "webp",
  "xls",
  "xlsx",
  "xml",
  "zip",
]);
/** Anchored, non-backtracking: extension + whitespace + parenthesised size. */
const FILE_SIZE_SUFFIX_RE = /^([a-z0-9]{2,5})\s*\(\d[\d.]*\s*[KMGT]?B\)$/i;

function isFileTypeSizeText(text: string): boolean {
  const m = FILE_SIZE_SUFFIX_RE.exec(text);
  return m !== null && FILE_DOWNLOAD_EXTENSIONS.has(m[1].toLowerCase());
}

function isShortHeadingLabel(text: string): boolean {
  const normalized = text.trim();
  if (!normalized || normalized.length > 72) return false;
  if (/[.!?;:]/.test(normalized)) return false;
  return normalized.split(/\s+/).filter(Boolean).length <= 6;
}

function normalizeHeadingText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFileDownloadBoilerplate(content: string): string {
  return content.replace(
    /<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    (match, inner: string) =>
      isFileTypeSizeText(inner.replace(/<[^>]*>/g, "").trim()) ? "" : match,
  );
}

const LEADING_WHITESPACE_RE = /^\s+/;
const LEADING_ANCHOR_OPEN_RE = /^<a\b[^>]*>\s*/i;
const LEADING_IMAGE_RE = /^<img\b[^>]*\/?>(?:\s*)/i;
const LEADING_ANCHOR_CLOSE_RE = /^<\/a>\s*/i;
const LEADING_HEADING_RE = /^<h[2-4]\b[^>]*>[\s\S]*?<\/h[2-4]>\s*/i;

function consumeLeadingToken(source: string, tokenRe: RegExp): string {
  return tokenRe.exec(source)?.[0] ?? "";
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

function parseLeadMediaAndHeadingPrefix(content: string): {
  consumedLength: number;
  headingBlock: string;
  imagePrefix: string;
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

  for (;;) {
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

  for (;;) {
    const heading = consumeLeadingToken(
      content.slice(cursor),
      LEADING_HEADING_RE,
    );
    if (!heading) break;
    headingBlock += heading;
    cursor += heading.length;
  }

  return { consumedLength: cursor, headingBlock, imagePrefix };
}

function readFirstImageSource(content: string): string {
  const { imagePrefix } = parseLeadMediaAndHeadingPrefix(content);
  const imageTag = /<img\b[^>]*>/i.exec(imagePrefix)?.[0];
  if (!imageTag) return "";
  const srcMatch = /\bsrc=["']([^"']+)["']/i.exec(imageTag);
  return (srcMatch?.[1] ?? "").trim();
}

function removeLeadingDuplicateImage(content: string): string {
  const { imagePrefix } = parseLeadMediaAndHeadingPrefix(content);
  if (!imagePrefix.trim()) return content;

  const firstSrc = normalizeImageSource(readFirstImageSource(content));
  if (!firstSrc) return content;

  const afterLeadImage = content.slice(imagePrefix.length);

  const imageSrcMatches = [
    ...afterLeadImage.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi),
  ].map((match) => normalizeImageSource(match[1]));

  const hasDuplicateImageSource = imageSrcMatches.includes(firstSrc);
  if (!hasDuplicateImageSource) return content;

  return normalizeArticleHtmlSpacing(afterLeadImage);
}

function stripLeadMediaBoilerplateHeadings(content: string): string {
  const { consumedLength, headingBlock, imagePrefix } =
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

/** Promotional / call-to-action pattern (cross-site generic). */
const PROMO_CTA_RE =
  /add\s+as\s+preferred\s+source|follow\s+\S+\s+on\s+whatsapp|you\s+need\s+javascript\s+enabled|you\s+may\s+like\s+to\s+watch|essential\s+reads|preferred\s+source\s+on\s+google|reader[-\s]supported\s+publication|to\s+receive\s+new\s+posts|consider\s+becoming\s+a\s+subscriber/i;

/**
 * Final clean-up pass applied to sanitized article HTML before it is stored
 * or returned to the client.  Two things are removed in sequence:
 *
 * 1. Comment-engagement boilerplate — login prompts, "before commenting"
 *    notices, etc. that manipulators sometimes pull in from the comment section.
 * 2. Leading inline bio/profile fragments — linked author bios that appear
 *    before the first paragraph block but are not article content.
 * 3. Nav/footer boilerplate guard — if the whole remaining content still looks
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

  const withoutLeadingBio = stripLeadingInlineBioBlock(withoutPromos);

  const withoutDuplicateLeadImage = removeLeadingDuplicateImage(withoutLeadingBio);

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
