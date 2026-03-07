/**
 * Article content processing helpers for ArticleCard rendering.
 * Covers: HTML-to-plaintext stripping, preview truncation, rich-text CSS classes.
 */

import { type Article } from "@/lib";
import { getUrlHostnameDisplayLabel } from "@/lib/utils/url";

export function getUrlHostnameLabel(raw?: string): string {
  return getUrlHostnameDisplayLabel(raw, { fallback: raw ?? "No source URL" });
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
  return getUrlHostnameLabel(article.feedUrl ?? article.link);
}

// ── Rich-text CSS classes ─────────────────────────────────────────────────────

const RICH_CONTENT_SHARED =
  "font-sans antialiased break-words tracking-[-0.01em] [&_p]:m-0 [&_p]:mb-3 [&_p]:leading-6 [&_p:last-child]:mb-0 [&_p:empty]:h-[1em] [&_p:empty]:mb-0 [&_h3]:mb-1.5 [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_h3]:leading-6 [&_h3]:tracking-[-0.012em] [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_li]:leading-6 [&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/35 [&_pre]:p-2 [&_code]:rounded [&_code]:bg-muted/35 [&_code]:px-1 [&_code]:py-0.5 [&_a]:underline [&_a]:underline-offset-2 [&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_img]:min-h-[120px] [&_img]:bg-muted/20 [&_img]:[backface-visibility:hidden] [&_img]:transform-gpu [&_figure]:my-3 [&_figure]:max-w-full [&_figcaption]:mt-1.5 [&_figcaption]:text-xs [&_figcaption]:text-muted-foreground [&_figcaption]:italic";

export function getRichContentClass(expanded: boolean): string {
  return expanded
    ? `text-[0.97rem] leading-7 text-foreground/85 [&_h1]:mb-2.5 [&_h1]:text-[1.12rem] [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-[1.02rem] [&_h2]:font-semibold ${RICH_CONTENT_SHARED}`
    : `text-[0.91rem] leading-6 text-muted-foreground/85 [&_h1]:mb-2.5 [&_h1]:text-[0.98rem] [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-[0.95rem] [&_h2]:font-semibold ${RICH_CONTENT_SHARED}`;
}
