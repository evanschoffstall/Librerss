import {
  normalizeArticleHtmlSpacing,
  SOCIAL_SHARE_LINK_RE,
  stripLeadingInlineBioBlock,
  toPlainText,
} from "./cleaners";
import {
  removeLeadingDuplicateImage,
  stripLeadMediaBoilerplateHeadings,
} from "./lead-media";

/**
 * @param li
 */
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

/**
 * @param content
 */
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

/**
 * @param text
 */
function isFileTypeSizeText(text: string): boolean {
  const m = FILE_SIZE_SUFFIX_RE.exec(text);
  return m !== null && FILE_DOWNLOAD_EXTENSIONS.has(m[1].toLowerCase());
}

/**
 * @param text
 */
function isShortHeadingLabel(text: string): boolean {
  const normalized = text.trim();
  if (!normalized || normalized.length > 72) return false;
  if (/[.!?;:]/.test(normalized)) return false;
  return normalized.split(/\s+/).filter(Boolean).length <= 6;
}

/**
 * @param value
 */
function normalizeHeadingText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param content
 */
function stripFileDownloadBoilerplate(content: string): string {
  return content.replace(
    /<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    (match, inner: string) =>
      isFileTypeSizeText(inner.replace(/<[^>]*>/g, "").trim()) ? "" : match,
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
 *    notices, etc. That manipulators sometimes pull in from the comment section.
 * 2. Leading inline bio/profile fragments — linked author bios that appear
 *    before the first paragraph block but are not article content.
 * 3. Nav/footer boilerplate guard — if the whole remaining content still looks
 *    like site chrome (high link density + site-chrome keywords), discard it
 *    entirely so the caller can fall through to a better fallback.
 *
 * `_articleUrl` is reserved for future per-origin cleaning rules but is
 * intentionally unused today to keep the logic domain-agnostic.
 * @param sanitizedContent
 * @param _articleUrl
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

  const withoutDuplicateLeadImage =
    removeLeadingDuplicateImage(withoutLeadingBio);

  const withoutMediaHeadings = stripLeadMediaBoilerplateHeadings(
    withoutDuplicateLeadImage,
    isShortHeadingLabel,
    normalizeHeadingText,
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
 * @param content
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
 * @param content
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
 * @param content
 */
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
 * @param inner
 */
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
 * @param content
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
