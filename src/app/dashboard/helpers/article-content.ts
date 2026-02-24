/**
 * Article content processing helpers for ArticleCard rendering.
 * Covers: HTML-to-plaintext stripping, preview truncation, rich-text CSS classes.
 */

import { type Article } from "@/lib";
import { getUrlHostnameLabel } from "@/lib/utils/url";

function getUrlHostnameLabelForDisplay(raw?: string): string {
  const label = getUrlHostnameLabel(raw, raw ?? "No source URL");
  return label.replace(/^www\./i, "");
}

export { getUrlHostnameLabelForDisplay as getUrlHostnameLabel };

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
  return getUrlHostnameLabelForDisplay(article.feedUrl ?? article.link);
}

// ── Rich-text CSS classes ─────────────────────────────────────────────────────

const RICH_CONTENT_SHARED =
  "font-sans antialiased break-words tracking-[-0.015em] [&_p]:m-0 [&_p]:mb-4 [&_p]:leading-7 [&_p:last-child]:mb-0 [&_p:empty]:h-[1em] [&_p:empty]:mb-0 [&_h3]:mb-2 [&_h3]:text-[0.98rem] [&_h3]:font-semibold [&_h3]:leading-7 [&_h3]:tracking-[-0.015em] [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1.5 [&_li]:leading-7 [&_blockquote]:mb-4 [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/35 [&_pre]:p-2.5 [&_code]:rounded [&_code]:bg-muted/35 [&_code]:px-1 [&_code]:py-0.5 [&_a]:underline [&_a]:underline-offset-2 [&_img]:my-4 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_figure]:my-4 [&_figure]:max-w-full [&_figcaption]:mt-2 [&_figcaption]:text-xs [&_figcaption]:text-muted-foreground [&_figcaption]:italic";

export function getRichContentClass(expanded: boolean): string {
  return expanded
    ? `text-[1rem] leading-7 text-foreground/85 [&_h1]:mb-3 [&_h1]:text-[1.2rem] [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-[1.08rem] [&_h2]:font-semibold ${RICH_CONTENT_SHARED}`
    : `text-[0.92rem] leading-6 text-muted-foreground/85 [&_h1]:mb-3 [&_h1]:text-[1.02rem] [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-[0.98rem] [&_h2]:font-semibold ${RICH_CONTENT_SHARED}`;
}
