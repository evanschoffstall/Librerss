import { maxArticleConsecutiveBlankLines } from "@/lib/config";
import { hasApJunkClass, isRelatedHeading } from "./patterns";

export function stripApJunkBlocks(html: string): string {
  const stripTags = ["div", "section", "aside", "nav", "ul", "figure"];

  const marked = stripTags.reduce((currentHtml, tagName) => {
    const openTagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");

    return currentHtml.replace(openTagPattern, (openTag) => {
      if (!hasApJunkClass(openTag)) {
        return openTag;
      }

      return `<!--STRIP_${tagName.toUpperCase()}-->`;
    });
  }, html);

  return marked.replace(
    /<!--STRIP_(DIV|SECTION|ASIDE|NAV|UL|FIGURE)-->(?:[\s\S]*?)<\/\1>/gi,
    "",
  );
}

export function stripEmbeddedMediaBlocks(html: string): string {
  return html
    .replace(/<(iframe|video|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, "\n")
    .replace(/<(iframe|video|object|embed)\b[^>]*\/?>/gi, "\n");
}

/** Converts HTML to plain text by stripping tags and normalizing whitespace. */
export function toPlainText(value: string): string {
  const maxConsecutiveBlankLines = maxArticleConsecutiveBlankLines();
  const minOverflowRun = maxConsecutiveBlankLines + 1;

  return stripEmbeddedMediaBlocks(value)
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

function collapseExcessNewlines(html: string): string {
  const maxConsecutiveBlankLines = maxArticleConsecutiveBlankLines();
  const minOverflowRun = maxConsecutiveBlankLines + 1;

  return html
    .replace(/\r\n?/g, "\n")
    .replace(
      new RegExp(`((?:<br\\s*\\/?>[\\s\\n]*){${minOverflowRun},})`, "gi"),
      "<br>".repeat(maxConsecutiveBlankLines),
    )
    .replace(
      new RegExp(
        `((?:<p>(?:\\s|&nbsp;|&#160;|<br\\s*\\/?>)*<\\/p>\\s*){${minOverflowRun},})`,
        "gi",
      ),
      "<p></p>".repeat(maxConsecutiveBlankLines),
    )
    .replace(
      new RegExp(`(?:\\n[ \\t]*){${minOverflowRun},}`, "g"),
      "\n".repeat(maxConsecutiveBlankLines),
    )
    .replace(
      new RegExp(`(?:[ \\t]*\\n){${minOverflowRun},}`, "g"),
      "\n".repeat(maxConsecutiveBlankLines),
    );
}

function isEmptyInlineHtml(content: string): boolean {
  const withoutFormattingTags = content.replace(
    /<\/?(?:strong|em|b|i|u|span)\b[^>]*>/gi,
    "",
  );
  const withoutBreaks = withoutFormattingTags.replace(/<br\s*\/?>/gi, " ");
  const withoutNbspEntities = withoutBreaks
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ");

  return withoutNbspEntities.trim().length === 0;
}

function stripEmptyTagBlocks(html: string, tagName: "p" | "figure"): string {
  return html.replace(
    new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>\\s*`, "gi"),
    (match, content: string) => (isEmptyInlineHtml(content) ? "" : match),
  );
}

export function stripOrphanedRelatedBlocks(html: string): string {
  const withoutHeadingLists = html.replace(
    /<h[1-6]>([^<]*)<\/h[1-6]>\s*<(?:ul|ol)[\s\S]*?<\/(?:ul|ol)>/gi,
    (match, headingText: string) =>
      isRelatedHeading(headingText) ? "" : match,
  );

  const withoutLooseHeadings = withoutHeadingLists.replace(
    /<h[1-6]>([^<]*)<\/h[1-6]>/gi,
    (match, headingText: string) =>
      isRelatedHeading(headingText) ? "" : match,
  );

  return collapseExcessNewlines(withoutLooseHeadings);
}

export function normalizeArticleHtmlSpacing(html: string): string {
  return stripEmptyTagBlocks(stripEmptyTagBlocks(html, "figure"), "p")
    .replace(/\r\n?/g, "\n")
    .replace(/\n([ \t]*\n)+/g, "\n")
    .replace(/>\s*\n\s*\n+\s*</g, ">\n<")
    .trim();
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  ldquo: "\u201C",
  rdquo: "\u201D",
  lsquo: "\u2018",
  rsquo: "\u2019",
  hellip: "\u2026",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  bull: "\u2022",
  middot: "\u00B7",
  laquo: "\u00AB",
  raquo: "\u00BB",
  emdash: "\u2014",
  euro: "\u20AC",
};

function decodeNumericEntity(raw: string, radix: 10 | 16): string {
  try {
    return String.fromCodePoint(Number.parseInt(raw, radix));
  } catch {
    return "";
  }
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (_match, rawEntity: string) => {
      const entity = rawEntity.toLowerCase();
      if (entity.startsWith("#x"))
        return decodeNumericEntity(entity.slice(2), 16);
      if (entity.startsWith("#"))
        return decodeNumericEntity(entity.slice(1), 10);
      return NAMED_ENTITIES[entity] ?? "";
    },
  );
}

export const __decodeHtmlEntitiesForTests = decodeHtmlEntities;

export function toParagraphHtml(raw: string): string {
  return raw
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => `<p>${segment.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function removeElementById(rawHtml: string, idValue: string): string {
  const escaped = idValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRe = new RegExp(
    `<([a-z][a-z0-9:-]*)\\b[^>]*\\bid=["']${escaped}["'][^>]*>`,
    "i",
  );
  const startMatch = startRe.exec(rawHtml);
  if (!startMatch?.[1]) return rawHtml;
  const tagName = startMatch[1];
  const afterOpenTag = startMatch.index + startMatch[0].length;
  const tagRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagRe.lastIndex = afterOpenTag;
  let depth = 1;
  let endIdx = -1;
  let m: RegExpExecArray | null;
  while (depth > 0 && (m = tagRe.exec(rawHtml)) !== null) {
    if (m[0].startsWith("</")) depth--;
    else depth++;
    if (depth === 0) endIdx = m.index + m[0].length;
  }
  return endIdx < 0
    ? rawHtml
    : rawHtml.slice(0, startMatch.index) + rawHtml.slice(endIdx);
}

function removeElementsByClassPattern(
  html: string,
  classPattern: RegExp,
): string {
  const openRe = /<([a-z][a-z0-9:-]*)\b[^>]*class=["']([^"']*)["'][^>]*>/gi;
  let result = html;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(result)) !== null) {
    if (!classPattern.test(match[2]!)) continue;
    const tagName = match[1]!;
    const afterOpen = match.index + match[0].length;
    const closeRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
    closeRe.lastIndex = afterOpen;
    let depth = 1;
    let endIdx = -1;
    let m: RegExpExecArray | null;
    while (depth > 0 && (m = closeRe.exec(result)) !== null) {
      if (m[0].startsWith("</")) depth--;
      else depth++;
      if (depth === 0) endIdx = m.index + m[0].length;
    }
    if (endIdx < 0) continue;
    result = result.slice(0, match.index) + result.slice(endIdx);
    openRe.lastIndex = match.index;
  }
  return result;
}

const COMMENT_WIDGET_IDS = [
  "viafoura-comments",
  "viafoura-comments-container",
  "viafoura-comment-wrapper",
  "kiosq-app-paywall-js",
  "kiosq-app",
  "coral-display-comments",
  "comment-container",
  "mj-comments-container",
  "utility-bar",
] as const;

/**
 * Strip noise containers (scripts, styles, headers, footers, comment widgets,
 * pure-link lists, social share blocks, nosnippet asides) from raw HTML before
 * passing to the content extractor.
 */
export function preCleanHtmlForExtraction(rawHtml: string): string {
  let html = rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");

  for (const id of COMMENT_WIDGET_IDS) html = removeElementById(html, id);

  // Strip signup/subscription widgets and CTA containers (depth-aware).
  html = removeElementsByClassPattern(
    html,
    /sailthru|signup-widget|subscribe-widget|newsletter-signup|preferred-source|nlp-ignore-block|newsletter-form|utility-bar|UtilityBar|social-share|sharethrough/i,
  );

  // Strip pure-link <ul> blocks (8+ items, all bare <a>) — tag clouds, nav panels.
  html = html.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (ulBlock) => {
    const items = [...ulBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    if (items.length < 8) return ulBlock;
    return items.every((m) =>
      /^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test((m[1] ?? "").trim()),
    )
      ? ""
      : ulBlock;
  });

  html = html.replace(
    /<aside\b[^>]*\bdata-nosnippet\b[^>]*>[\s\S]*?<\/aside>/gi,
    "",
  );

  // Strip social share link blocks.
  html = html.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (ulBlock) => {
    const items = [...ulBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    if (items.length === 0) return ulBlock;
    return items.every((m) => {
      const inner = (m[1] ?? "").trim();
      if (!/^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test(inner)) return false;
      return /facebook\.com\/sharer|x\.com\/intent\/tweet|twitter\.com\/intent\/tweet|whatsapp(?:\.com|:\/\/)|mailto:\?/i.test(
        inner,
      );
    })
      ? ""
      : ulBlock;
  });

  return html;
}
