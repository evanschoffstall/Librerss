import { normalizeArticleHtmlSpacing, toParagraphHtml } from "./cleaners";
import { sanitizeArticleHtml, toPlainText } from "./sanitize";

function recoverSanitizedImageHtml(rawHtml: string): string {
  const imgTags = rawHtml.match(/<img\b[^>]*>/gi) ?? [];
  if (imgTags.length === 0) return "";

  const recovered = imgTags
    .map((tag) => sanitizeArticleHtml(tag).trim())
    .filter((tag) => /<img\b/i.test(tag));

  return recovered.join("\n");
}

export function sanitizeExtractedContent(rawContent: string): string {
  const normalized = rawContent.trim();
  if (!normalized) return "";

  const containsHtml = /<\/?[a-z][\s\S]*>/i.test(normalized);
  // `section` is in nonTextTags so sanitize-html discards its children entirely.
  // The extractor often wraps content in <section> legitimately, so we strip
  // only the section open/close tags here (unwrap, not discard) before the
  // general sanitizer runs. This does not affect <aside> or <nav> which are
  // also nonTextTags and should still be discarded.
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
      return normalizeArticleHtmlSpacing(
        [recoveredImageHtml, sanitized].filter(Boolean).join("\n"),
      );
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
    return normalizeArticleHtmlSpacing(
      [recoveredImageHtml, fallbackSanitized].filter(Boolean).join("\n"),
    );
  }

  return fallbackSanitized;
}
