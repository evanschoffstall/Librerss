import { logger } from "@/lib/logger";
import {
  normalizeArticleHtmlSpacing,
  toParagraphHtml,
  toPlainText,
} from "./cleaners";
import { sanitizeArticleHtml } from "./sanitize";

function contentPreview(s: string, max = 200): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

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
  if (!normalized) {
    logger.info(`[sanitize-content] input empty, returning ""`);
    return "";
  }

  logger.info(`[sanitize-content] start`, {
    inputChars: normalized.length,
    inputPreview: contentPreview(normalized),
  });

  const containsHtml = /<\/?[a-z][\s\S]*>/i.test(normalized);
  const unwrapped = containsHtml
    ? normalized.replace(/<\/?section\b[^>]*>/gi, "")
    : normalized;
  const htmlCandidate = containsHtml ? unwrapped : toParagraphHtml(unwrapped);

  logger.info(`[sanitize-content] prepared htmlCandidate`, {
    containsHtml,
    unwrappedSections: containsHtml && unwrapped.length !== normalized.length,
    candidateChars: htmlCandidate.length,
  });

  const sanitized = sanitizeArticleHtml(htmlCandidate);
  logger.info(`[sanitize-content] after sanitizeArticleHtml`, {
    sanitizedChars: sanitized.length,
    sanitizedPreview: contentPreview(sanitized),
  });

  const recoveredImageHtml = containsHtml
    ? recoverSanitizedImageHtml(htmlCandidate)
    : "";
  const recoveredImageCount = (recoveredImageHtml.match(/<img\b/gi) ?? [])
    .length;

  if (recoveredImageCount > 0) {
    logger.info(`[sanitize-content] recovered images from raw HTML`, {
      recoveredImageCount,
    });
  }

  if (sanitized.trim()) {
    if (
      recoveredImageCount > 0 &&
      recoveredImageHtml &&
      !/<img\b/i.test(sanitized)
    ) {
      const merged = normalizeArticleHtmlSpacing(
        [recoveredImageHtml, sanitized].filter(Boolean).join("\n"),
      );
      logger.info(`[sanitize-content] returning sanitized + recovered images`, {
        outputChars: merged.length,
      });
      return merged;
    }

    logger.info(`[sanitize-content] returning sanitized content`, {
      outputChars: sanitized.length,
    });
    return sanitized;
  }

  logger.info(
    `[sanitize-content] sanitized was empty, falling back to plainText`,
  );
  const plainText = containsHtml ? toPlainText(normalized) : normalized;
  if (!plainText.trim()) {
    logger.info(`[sanitize-content] plainText fallback also empty`);
    return "";
  }

  const fallbackSanitized = sanitizeArticleHtml(toParagraphHtml(plainText));
  logger.info(`[sanitize-content] plainText fallback sanitized`, {
    plainTextChars: plainText.length,
    fallbackSanitizedChars: fallbackSanitized.length,
    fallbackPreview: contentPreview(fallbackSanitized),
  });

  if (
    recoveredImageCount > 0 &&
    recoveredImageHtml &&
    !/<img\b/i.test(fallbackSanitized)
  ) {
    const merged = normalizeArticleHtmlSpacing(
      [recoveredImageHtml, fallbackSanitized].filter(Boolean).join("\n"),
    );
    logger.info(
      `[sanitize-content] returning plainText fallback + recovered images`,
      {
        outputChars: merged.length,
      },
    );
    return merged;
  }

  logger.info(`[sanitize-content] returning plainText fallback`, {
    outputChars: fallbackSanitized.length,
  });
  return fallbackSanitized;
}
