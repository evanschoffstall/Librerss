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
