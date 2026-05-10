import {
  isMediaUtilityLinkText,
  stripStandaloneMediaAttributionText,
} from "@/lib/sanitize/media-widget";

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
 * Return whether is social share list item.
 * @param li - The li.
 * @returns Whether is social share list item.
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
 * Process the strip share engagement toolbars.
 * @param content - The content.
 * @returns The strip share engagement toolbars.
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
 * Return whether is file type size text.
 * @param text - The text.
 * @returns Whether is file type size text.
 */
function isFileTypeSizeText(text: string): boolean {
  const m = FILE_SIZE_SUFFIX_RE.exec(text);
  return m !== null && FILE_DOWNLOAD_EXTENSIONS.has(m[1].toLowerCase());
}

/**
 * Return whether is short heading label.
 * @param text - The text.
 * @returns Whether is short heading label.
 */
function isShortHeadingLabel(text: string): boolean {
  const normalized = text.trim();
  if (!normalized || normalized.length > 72) return false;
  if (/[.!?;:]/.test(normalized)) return false;
  return normalized.split(/\s+/).filter(Boolean).length <= 6;
}

/**
 * Normalize the heading text.
 * @param value - The value.
 * @returns The heading text.
 */
function normalizeHeadingText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Process the strip file download boilerplate.
 * @param content - The content.
 * @returns The strip file download boilerplate.
 */
function stripFileDownloadBoilerplate(content: string): string {
  return content.replace(
    /<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    (match, inner: string) =>
      isFileTypeSizeText(inner.replace(/<[^>]*>/g, "").trim()) ? "" : match,
  );
}

/** Promotional / call-to-action phrases (cross-site generic). */
const PROMO_CTA_PHRASES = [
  "add as preferred source",
  "consider becoming a subscriber",
  "essential reads",
  "preferred source on google",
  "read the fact sheet",
  "reader supported publication",
  "reader-supported publication",
  "to receive new posts",
  "you may like to watch",
  "you need javascript enabled",
] as const;

/** Metadata and utility labels that identify non-body lead chrome. */
const LEADING_ARTICLE_CHROME_PHRASES = [
  "by",
  "communications and publishing",
  "communication and publishing",
  "date",
  "fact sheet",
  "press release",
  "read the",
] as const;

/**
 * Matches standalone media-control labels that serve as UI affordances rather
 * than article content. Anchors whose entire non-image text matches this pattern
 * are collapsed to their image tag alone; anchors that carry a real caption or
 * attribution alongside an image are left intact.
 *
 * The pattern is intentionally broad so it generalises across publishers and
 * does not require an exhaustive enumeration of every possible label variant.
 */
/** Standalone media labels that describe embedded widgets, not article prose. */
const MEDIA_UTILITY_HEADING_TEXTS = new Set(["video file"]);

/** Section headings that commonly introduce related-content and taxonomy chrome. */
const TRAILING_ARTICLE_CHROME_HEADINGS = [
  "<h2>more information</h2>",
  "<h2>recent news</h2>",
  "<h3>more information</h3>",
  "<h3>recent news</h3>",
] as const;

/**
 * Applies final reader-content cleanup after the structural sanitizer has made
 * the HTML safe. This pass removes generic publisher chrome such as share
 * controls, lead metadata, and media utility labels while preserving actual
 * article prose, links, and images.
 * @param sanitizedContent - Safe article HTML produced by the sanitizer.
 * @param _articleUrl - Canonical article URL reserved for future generic rules.
 * @returns Cleaned article HTML ready for reader display.
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

  const withoutLeadingChrome = stripLeadingArticleChrome(sanitizedContent);

  const withoutShareToolbars =
    stripShareEngagementToolbars(withoutLeadingChrome);

  const withoutFileBoilerplate =
    stripFileDownloadBoilerplate(withoutShareToolbars);

  const withoutMediaUtilities = stripMediaUtilityBoilerplate(
    withoutFileBoilerplate,
  );

  const withoutEngagementPrompts = stripCommentEngagementBoilerplate(
    withoutMediaUtilities,
  );

  const withoutPromos = stripPromotionalCtaBlocks(withoutEngagementPrompts);

  const withoutLeadingBio = stripLeadingInlineBioBlock(withoutPromos);

  const withoutTrailingChrome = stripTrailingArticleChrome(withoutLeadingBio);

  const withoutDuplicateLeadImage = removeLeadingDuplicateImage(
    withoutTrailingChrome,
  );

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
 * Return whether has readable article body.
 * @param content - The content.
 * @returns Whether has readable article body.
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
 * Return whether is likely nav footer boilerplate.
 * @param content - The content.
 * @returns Whether is likely nav footer boilerplate.
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
 * Process the strip comment engagement boilerplate.
 * @param content - The content.
 * @returns The strip comment engagement boilerplate.
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
 * Return whether is promo cta.
 * @param inner - The inner.
 * @returns Whether is promo cta.
 */
function isPromoCta(inner: string): boolean {
  const text = inner
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return (
    PROMO_CTA_PHRASES.some((phrase) => text.includes(phrase)) ||
    (text.startsWith("follow ") && text.includes(" on whatsapp"))
  );
}

/**
 * Removes title, byline, date, and CTA fragments that appear before the first
 * article paragraph when confidence selection intentionally chooses a broader
 * CMS article wrapper to preserve lead prose.
 * @param content - Sanitized article HTML to inspect.
 * @returns HTML with generic leading chrome removed when detected.
 */
function stripLeadingArticleChrome(content: string): string {
  const firstParagraphIndex = content.search(/<p\b/i);
  if (firstParagraphIndex <= 0) return content;

  const leadingChunk = content.slice(0, firstParagraphIndex);
  if (/<img\b/i.test(leadingChunk)) return content;

  const leadingText = toPlainText(leadingChunk).replace(/\s+/g, " ").trim();
  const normalizedLeadingText = leadingText.toLowerCase();
  if (
    !LEADING_ARTICLE_CHROME_PHRASES.some((phrase) =>
      normalizedLeadingText.includes(phrase),
    )
  ) {
    return content;
  }

  return content.slice(firstParagraphIndex);
}

/**
 * Removes media-widget labels and download/detail links while preserving image
 * anchors and any meaningful caption or attribution text alongside them.
 *
 * For image-containing anchors the surrounding non-image text is inspected:
 * - Empty non-image text → collapse to the bare image anchor (formatting only).
 * - Text that matches the generic media utility classifier → strip the UI label, keep the image.
 * - Any other text → preserve the whole anchor intact so genuine captions,
 *   photographer credits, and alt descriptions reach the reader.
 * @param content - Sanitized article HTML to inspect.
 * @returns HTML without generic media utility widget text.
 */
function stripMediaUtilityBoilerplate(content: string): string {
  return content
    .replace(
      /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (match, _level: string, inner: string) => {
        const headingText = toPlainText(inner)
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        return MEDIA_UTILITY_HEADING_TEXTS.has(headingText) ? "" : match;
      },
    )
    .replace(
      /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
      (match, attrs: string, inner: string) => {
        const imageMatch = /<img\b[\s\S]*?>/i.exec(inner);
        if (imageMatch) {
          // Determine what text surrounds the image inside this anchor.
          const nonImageText = toPlainText(inner.replace(imageMatch[0], ""))
            .replace(/\s+/g, " ")
            .trim();
          // Collapse to the bare image only when there is no accompanying text
          // or the text is a recognised UI control label. Real captions and
          // photographer attributions must survive so readers see them.
          if (!nonImageText || isMediaUtilityLinkText(nonImageText)) {
            return `<a${attrs}>${imageMatch[0]}</a>`;
          }
          return match;
        }

        const linkText = toPlainText(inner)
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        return isMediaUtilityLinkText(linkText) ? "" : match;
      },
    )
    .replace(/\s*\|\s*/g, " | ");
}

/**
 * Process the strip promotional cta blocks.
 * @param content - The content.
 * @returns The strip promotional cta blocks.
 */
function stripPromotionalCtaBlocks(content: string): string {
  return stripStandaloneMediaAttributionText(
    content
      .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (m, inner: string) =>
        isPromoCta(inner) ? "" : m,
      )
      .replace(
        // eslint-disable-next-line security/detect-unsafe-regex -- Pre-sanitized HTML input; lazy quantifiers prevent excessive backtracking
        /(?:<br\s*\/?>\s*)*<a\b[^>]*>([\s\S]*?)<\/a>(?:\s*<br\s*\/?>\s*)*/gi,
        (m, inner: string) => (isPromoCta(inner) ? "" : m),
      ),
  );
}

/**
 * Removes trailing related-news, taxonomy, and last-updated sections that follow
 * an otherwise complete article body. This keeps publisher recommendation cards
 * from entering reader content while preserving article headings and media above
 * the first chrome boundary.
 * @param content - Sanitized article HTML to inspect for a trailing chrome block.
 * @returns HTML before the first confirmed trailing chrome heading.
 */
function stripTrailingArticleChrome(content: string): string {
  const lowerContent = content.toLowerCase();
  const chromeStart = TRAILING_ARTICLE_CHROME_HEADINGS.reduce<null | number>(
    (earliest, heading) => {
      const index = lowerContent.indexOf(heading);
      if (index < 0) return earliest;

      const tail = lowerContent.slice(index);
      const hasChromeTail =
        tail.includes("feature story") ||
        tail.includes("last updated by") ||
        tail.includes("more news") ||
        tail.includes("/tags/");
      if (!hasChromeTail) return earliest;

      return earliest === null ? index : Math.min(earliest, index);
    },
    null,
  );

  if (chromeStart === null) return content;

  const retained = content.slice(0, chromeStart).trimEnd();
  const hasArticleBeforeChrome =
    (retained.match(/<p\b/gi)?.length ?? 0) >= 2 || /<img\b/i.test(retained);
  return hasArticleBeforeChrome ? retained : content;
}
