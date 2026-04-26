import {
  normalizeArticleHtmlSpacing,
  toParagraphHtml,
  toPlainText,
} from "./cleaners";
import { sanitizeArticleHtml } from "./sanitize";

/**
 * Describes the sanitized content context.
 */
interface SanitizedContentContext {
  containsHtml: boolean;
  htmlCandidate: string;
  normalized: string;
  recoveredImageCount: number;
  recoveredImageHtml: string;
}

/**
 * Process the sanitize raw content.
 * @param rawContent - The raw content.
 * @returns The sanitize raw content.
 */
export function sanitizeRawContent(rawContent: string): string {
  const context = createSanitizedContentContext(rawContent);
  if (!context) return "";

  const sanitized = sanitizeArticleHtml(context.htmlCandidate);

  if (sanitized.trim()) {
    return mergeRecoveredImagesIfNeeded(sanitized, context) ?? sanitized;
  }

  const plainText = context.containsHtml
    ? toPlainText(context.normalized)
    : context.normalized;
  if (!plainText.trim()) return "";

  const fallbackSanitized = sanitizeArticleHtml(toParagraphHtml(plainText));

  return (
    mergeRecoveredImagesIfNeeded(fallbackSanitized, context) ??
    fallbackSanitized
  );
}

/**
 * Create the sanitized content context.
 * @param rawContent - The raw content.
 * @returns The sanitized content context.
 */
function createSanitizedContentContext(
  rawContent: string,
): null | SanitizedContentContext {
  const normalized = rawContent.trim();
  if (!normalized) {
    return null;
  }

  const containsHtml = /<\/?[a-z][\s\S]*>/i.test(normalized);
  const unwrapped = containsHtml
    ? normalized.replace(/<\/?section\b[^>]*>/gi, "")
    : normalized;
  const htmlCandidate = containsHtml ? unwrapped : toParagraphHtml(unwrapped);
  const recoveredImageHtml = containsHtml
    ? recoverSanitizedImageHtml(htmlCandidate)
    : "";

  return {
    containsHtml,
    htmlCandidate,
    normalized,
    recoveredImageCount: (recoveredImageHtml.match(/<img\b/gi) ?? []).length,
    recoveredImageHtml,
  };
}

/**
 * Process the merge recovered images if needed.
 * @param sanitizedHtml - The sanitized html.
 * @param context - The context used to process the merge recovered images if needed.
 * @returns The merge recovered images if needed.
 */
function mergeRecoveredImagesIfNeeded(
  sanitizedHtml: string,
  context: SanitizedContentContext,
): null | string {
  if (
    context.recoveredImageCount === 0 ||
    !context.recoveredImageHtml ||
    /<img\b/i.test(sanitizedHtml)
  ) {
    return null;
  }

  return normalizeArticleHtmlSpacing(
    [context.recoveredImageHtml, sanitizedHtml].filter(Boolean).join("\n"),
  );
}

/**
 * Process the recover sanitized image html.
 * @param rawHtml - The raw html.
 * @returns The recover sanitized image html.
 */
function recoverSanitizedImageHtml(rawHtml: string): string {
  const imgTags = rawHtml.match(/<img\b[^>]*>/gi) ?? [];
  if (imgTags.length === 0) return "";

  const recovered = imgTags
    .map((tag) => sanitizeArticleHtml(tag).trim())
    .filter((tag) => /<img\b/i.test(tag));

  return recovered.join("\n");
}
