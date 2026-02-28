import { maxArticleConsecutiveBlankLines } from "@/lib/config";
import { AP_JUNK_CLASS_PATTERN, RELATED_HEADING_PATTERN } from "./patterns";

export function stripApJunkBlocks(html: string): string {
  return html
    .replace(
      /<(div|section|aside|nav|ul|figure)(\s[^>]*)?>/gi,
      (openTag, tagName: string, attrs: string = "") => {
        if (AP_JUNK_CLASS_PATTERN.test(attrs)) {
          return `<!--STRIP_${tagName.toUpperCase()}-->`;
        }
        return openTag;
      },
    )
    .replace(
      /<!--STRIP_(DIV|SECTION|ASIDE|NAV|UL|FIGURE)-->(?:[\s\S]*?)<\/\1>/gi,
      "",
    );
}

export function stripEmbeddedMediaBlocks(html: string): string {
  return html
    .replace(/<(iframe|video|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, "\n")
    .replace(/<(iframe|video|object|embed)\b[^>]*\/?>/gi, "\n");
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

export function stripOrphanedRelatedBlocks(html: string): string {
  const withoutHeadingLists = html.replace(
    /<h[1-6]>([^<]*)<\/h[1-6]>\s*<(?:ul|ol)[\s\S]*?<\/(?:ul|ol)>/gi,
    (match, headingText: string) =>
      RELATED_HEADING_PATTERN.test(headingText) ? "" : match,
  );

  const withoutLooseHeadings = withoutHeadingLists.replace(
    /<h[1-6]>([^<]*)<\/h[1-6]>/gi,
    (match, headingText: string) =>
      RELATED_HEADING_PATTERN.test(headingText) ? "" : match,
  );

  return collapseExcessNewlines(withoutLooseHeadings);
}

export function normalizeArticleHtmlSpacing(html: string): string {
  return html
    .replace(/\r\n?/g, "\n")
    .replace(/<figure>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/figure>\s*/gi, "")
    .replace(
      /<p>(?:\s|&nbsp;|&#160;|<br\s*\/?>|<\/?(?:strong|em|b|i|u|span)\b[^>]*>)*<\/p>\s*/gi,
      "",
    )
    .replace(/<p>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/p>\s*/gi, "")
    .replace(/\n[ \t]*\n+/g, "\n")
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

export function toParagraphHtml(raw: string): string {
  return raw
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => `<p>${segment.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}
