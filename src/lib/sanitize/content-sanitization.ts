import {
  normalizeArticleHtmlSpacing,
  toParagraphHtml,
  toPlainText,
} from "./cleaners";
import { sanitizeArticleHtml } from "./sanitize";

function recoverSanitizedImageHtml(rawHtml: string): string {
  const imgTags = rawHtml.match(/<img\b[^>]*>/gi) ?? [];
  if (imgTags.length === 0) return "";

  const recovered = imgTags
    .map((tag) => sanitizeArticleHtml(tag).trim())
    .filter((tag) => /<img\b/i.test(tag));

  return recovered.join("\n");
}

export function sanitizeRawContent(rawContent: string): string {
  const normalized = rawContent.trim();
  if (!normalized) return "";

  const containsHtml = /<\/?[a-z][\s\S]*>/i.test(normalized);
  const unwrapped = containsHtml
    ? normalized.replace(/<\/?section\b[^>]*>/gi, "")
    : normalized;
  const htmlCandidate = containsHtml ? unwrapped : toParagraphHtml(unwrapped);

  const sanitized = sanitizeArticleHtml(htmlCandidate);

  const recoveredImageHtml = containsHtml
    ? recoverSanitizedImageHtml(htmlCandidate)
    : "";
  const recoveredImageCount = (recoveredImageHtml.match(/<img\b/gi) ?? [])
    .length;

  if (sanitized.trim()) {
    if (
      recoveredImageCount > 0 &&
      recoveredImageHtml &&
      !/<img\b/i.test(sanitized)
    ) {
      const merged = normalizeArticleHtmlSpacing(
        [recoveredImageHtml, sanitized].filter(Boolean).join("\n"),
      );
      return merged;
    }
    return sanitized;
  }

  const plainText = containsHtml ? toPlainText(normalized) : normalized;
  if (!plainText.trim()) return "";

  const fallbackSanitized = sanitizeArticleHtml(toParagraphHtml(plainText));

  if (
    recoveredImageCount > 0 &&
    recoveredImageHtml &&
    !/<img\b/i.test(fallbackSanitized)
  ) {
    const merged = normalizeArticleHtmlSpacing(
      [recoveredImageHtml, fallbackSanitized].filter(Boolean).join("\n"),
    );
    return merged;
  }

  return fallbackSanitized;
}
