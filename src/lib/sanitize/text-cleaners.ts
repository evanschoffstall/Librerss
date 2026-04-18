import { maxArticleConsecutiveBlankLines } from "@/lib";

// Cached at first call — env does not change at runtime in a Node.js server
// process, and this value is read on every article parse invocation.
let _maxConsecutiveBlankLines: number | undefined;

/**
 * @param html
 */
export function collapseExcessNewlines(html: string): string {
  const maxConsecutiveBlankLines = getMaxConsecutiveBlankLines();
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

/**
 * @param value
 */
export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (_match, rawEntity: string) => {
      const entity = rawEntity.toLowerCase();
      if (entity.startsWith("#x")) {
        return decodeNumericEntity(entity.slice(2), 16);
      }

      if (entity.startsWith("#")) {
        return decodeNumericEntity(entity.slice(1), 10);
      }

      return NAMED_ENTITIES[entity] ?? "";
    },
  );
}

/**
 * @param html
 */
export function normalizeInlineText(html: string): string {
  return toPlainText(html).replace(/\s+/g, " ").trim();
}

/**
 * @param rawHtml
 */
export function normalizeNoscriptForManipulation(rawHtml: string): string {
  return rawHtml.replace(
    /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi,
    (_match, innerHtml: string) => {
      const plainText = toPlainText(innerHtml).replace(/\s+/g, " ").trim();
      const blockElementCount = (
        innerHtml.match(/<(?:p|h[1-6]|li|blockquote|figure|img)\b/gi) ?? []
      ).length;
      const isLikelyArticleFallback =
        blockElementCount >= 3 && plainText.length >= 220;

      return isLikelyArticleFallback ? innerHtml : "";
    },
  );
}

/**
 * @param html
 */
export function stripEmbeddedMediaBlocks(html: string): string {
  return html
    .replace(/<(iframe|video|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, "\n")
    .replace(/<(iframe|video|object|embed)\b[^>]*\/?>/gi, "\n");
}

/**
 * @param value
 */
export function toPlainText(value: string): string {
  const maxConsecutiveBlankLines = getMaxConsecutiveBlankLines();
  const minOverflowRun = maxConsecutiveBlankLines + 1;

  return normalizePlainTextOutput(
    stripHtmlForPlainText(value),
    maxConsecutiveBlankLines,
    minOverflowRun,
  );
}

/**
 * @param value
 * @param maxConsecutiveBlankLines
 * @param minOverflowRun
 */
function collapseOverflowBlankLines(
  value: string,
  maxConsecutiveBlankLines: number,
  minOverflowRun: number,
) {
  if (minOverflowRun <= maxConsecutiveBlankLines) {
    return value;
  }

  let normalized = "";
  let newlineRunLength = 0;

  for (const character of value) {
    if (character === "\n") {
      newlineRunLength += 1;
      if (newlineRunLength <= maxConsecutiveBlankLines) {
        normalized += character;
      }
      continue;
    }

    newlineRunLength = 0;
    normalized += character;
  }

  return normalized;
}

/**
 * @param raw
 * @param radix
 */
function decodeNumericEntity(raw: string, radix: 10 | 16): string {
  try {
    return String.fromCodePoint(Number.parseInt(raw, radix));
  } catch {
    return "";
  }
}

/**
 *
 */
function getMaxConsecutiveBlankLines(): number {
  return (_maxConsecutiveBlankLines ??= maxArticleConsecutiveBlankLines());
}

/**
 * @param tagStripped
 * @param maxConsecutiveBlankLines
 * @param minOverflowRun
 */
function normalizePlainTextOutput(
  tagStripped: string,
  maxConsecutiveBlankLines: number,
  minOverflowRun: number,
): string {
  return collapseOverflowBlankLines(
    decodeHtmlEntities(tagStripped)
      .replace(/\u00A0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .trim(),
    maxConsecutiveBlankLines,
    minOverflowRun,
  );
}

/**
 * @param value
 */
function stripHtmlForPlainText(value: string): string {
  return stripEmbeddedMediaBlocks(value)
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "\n")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(?:p|div|section|article|blockquote|li|h[1-6]|ul|ol|pre)>/gi,
      "\n",
    )
    .replace(/<[^>]*>/g, " ");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  bull: "\u2022",
  copy: "\u00A9",
  emdash: "\u2014",
  euro: "\u20AC",
  gt: ">",
  hellip: "\u2026",
  laquo: "\u00AB",
  ldquo: "\u201C",
  lsquo: "\u2018",
  lt: "<",
  mdash: "\u2014",
  middot: "\u00B7",
  nbsp: " ",
  ndash: "\u2013",
  quot: '"',
  raquo: "\u00BB",
  rdquo: "\u201D",
  reg: "\u00AE",
  rsquo: "\u2019",
  trade: "\u2122",
};
