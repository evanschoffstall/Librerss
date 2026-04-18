import {
  normalizeArticleHtmlSpacing,
  stripOrphanedRelatedBlocks,
} from "@/lib/sanitize";

/**
 * Shared article-preview sizing used by both server payload shaping and client
 * preview rendering so list responses never fetch more body text than the UI
 * can show while collapsed.
 */
export const ARTICLE_CONTENT_PREVIEW_LENGTH = 170;
export const ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH =
  ARTICLE_CONTENT_PREVIEW_LENGTH * 8;

/**
 * Truncates preview text at a word boundary when possible while preserving
 * whether the original source overflowed the preview budget.
 * @param text
 */
export function truncateArticlePreviewText(text: string): {
  hasOverflow: boolean;
  preview: string;
} {
  const hasOverflow = text.length > ARTICLE_CONTENT_PREVIEW_LENGTH;

  if (!hasOverflow) {
    return { hasOverflow, preview: text };
  }

  const candidate = text.slice(0, ARTICLE_CONTENT_PREVIEW_LENGTH + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const preview =
    lastSpace > 0
      ? candidate.slice(0, lastSpace)
      : text.slice(0, ARTICLE_CONTENT_PREVIEW_LENGTH);

  return { hasOverflow, preview: preview.trimEnd() };
}

/**
 * Normalizes stored article HTML before it is rendered or serialized so both
 * preview and full-article surfaces share the same cleanup behavior.
 * @param article
 */
export function withNormalizedArticleContent<
  T extends { content: null | string },
>(article: T): T {
  if (!article.content) {
    return article;
  }

  return {
    ...article,
    content: normalizeArticleHtmlSpacing(
      stripOrphanedRelatedBlocks(article.content),
    ),
  };
}
