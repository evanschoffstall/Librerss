/**
 * Article content processing helpers for ArticleCard rendering.
 * Covers: HTML-to-plaintext stripping, preview truncation, rich-text CSS classes.
 */

import { type Article } from "@/lib";
import { CONFIG } from "@/lib/config";
import { getHostnameLabel } from "./favicons";

// ── Plain-text conversion ─────────────────────────────────────────────────────

export function toPlainText(value: string): string {
  const maxConsecutiveBlankLines = CONFIG.MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
  const minOverflowRun = maxConsecutiveBlankLines + 1;

  return value
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "\n")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(?:p|div|section|article|blockquote|li|h[1-6]|ul|ol|pre)>/gi,
      "\n",
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(
      new RegExp(`(?:\\n){${minOverflowRun},}`, "g"),
      "\n".repeat(maxConsecutiveBlankLines),
    )
    .trim();
}

// ── Preview truncation ────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 170;

export function buildPreview(content: string): {
  preview: string;
  hasOverflow: boolean;
} {
  const hasOverflow = content.length > PREVIEW_LIMIT;

  if (!hasOverflow) {
    return { preview: content, hasOverflow };
  }

  const candidate = content.slice(0, PREVIEW_LIMIT + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const safeCut =
    lastSpace > 0
      ? candidate.slice(0, lastSpace)
      : content.slice(0, PREVIEW_LIMIT);

  return { preview: safeCut.trimEnd(), hasOverflow };
}

// ── Source label ──────────────────────────────────────────────────────────────

export function getArticleSourceLabel(article: Article): string {
  if (article.feedName?.trim()) {
    return article.feedName;
  }
  return getHostnameLabel(article.feedUrl ?? article.link);
}

// ── Rich-text CSS classes ─────────────────────────────────────────────────────

const RICH_CONTENT_SHARED =
  "leading-relaxed break-words [&_p]:m-0 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_p:empty]:h-[1em] [&_p:empty]:mb-0 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/35 [&_pre]:p-2 [&_code]:rounded [&_code]:bg-muted/35 [&_code]:px-1 [&_code]:py-0.5 [&_a]:underline [&_a]:underline-offset-2 [&_figure]:hidden [&_figcaption]:hidden";

export function getRichContentClass(expanded: boolean): string {
  return expanded
    ? `text-sm text-foreground/70 [&_h1]:mb-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold ${RICH_CONTENT_SHARED}`
    : `text-xs text-muted-foreground/75 [&_h1]:mb-3 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold ${RICH_CONTENT_SHARED}`;
}
