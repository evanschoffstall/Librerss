import { isRelatedHeading } from "./patterns";
import { collapseExcessNewlines, normalizeInlineText } from "./text-cleaners";

const LEADING_BLOCK_ELEMENT_RE =
  /<(?:p|h[1-6]|ul|ol|li|blockquote|pre|hr|img)\b/i;
const AUTHOR_BIO_MARKER_RE =
  /\b(author|columnist|journalist|reporter|editor|host|producer|correspondent|staff writer|has written|writes about|writes on|award-winning|newsletter|based in|lives in|joined|email\s*:|contact\s*:|follow\s+on)\b/gi;
const EMAIL_SIGNAL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;

interface InlineBioSignals {
  hasContactSignal: boolean;
  leadingText: string;
  linkedLabel: string;
  remainingBlockCount: number;
}

/**
 * @param html
 */
export function stripLeadingInlineBioBlock(html: string): string {
  const firstBlockIndex = html.search(LEADING_BLOCK_ELEMENT_RE);
  if (firstBlockIndex <= 0) return html;

  const leadingInline = html.slice(0, firstBlockIndex);
  if (!leadingInline.trim()) return html;

  const remainingContent = html.slice(firstBlockIndex);
  const anchorMatches = [
    ...leadingInline.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi),
  ];
  if (anchorMatches.length === 0 || anchorMatches.length > 3) return html;

  const signals = readInlineBioSignals(
    leadingInline,
    remainingContent,
    anchorMatches[0]?.[1] ?? "",
  );
  if (!signals) return html;

  return shouldStripInlineBio(signals) ? remainingContent.trimStart() : html;
}

/**
 * @param html
 * @param maxTextLength
 */
export function stripOrphanedInlineContent(
  html: string,
  maxTextLength = 200,
): string {
  const blockBoundaryRe =
    /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre)\b[^>]*>|<(?:hr|img)\b[^>]*\/?>/gi;

  const parts: { content: string; type: "gap" | "tag" }[] = [];
  let lastIndex = 0;
  let match: null | RegExpExecArray;

  while ((match = blockBoundaryRe.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ content: html.slice(lastIndex, match.index), type: "gap" });
    }
    parts.push({ content: match[0], type: "tag" });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    parts.push({ content: html.slice(lastIndex), type: "gap" });
  }

  return stripOrphanedInlineParts(parts, html, maxTextLength);
}

/**
 * @param html
 */
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

/**
 * @param text
 */
function countBioMarkerHits(text: string): number {
  return [...text.matchAll(AUTHOR_BIO_MARKER_RE)].length;
}

/**
 * @param leadingInline
 * @param remainingContent
 * @param linkedContent
 */
function readInlineBioSignals(
  leadingInline: string,
  remainingContent: string,
  linkedContent: string,
): InlineBioSignals | null {
  const leadingText = normalizeInlineText(leadingInline);
  if (leadingText.length < 40 || leadingText.length > 650) return null;

  const linkedLabel = normalizeInlineText(linkedContent);
  if (linkedLabel.length < 4) return null;

  return {
    hasContactSignal: EMAIL_SIGNAL_RE.test(leadingText),
    leadingText,
    linkedLabel,
    remainingBlockCount: (
      remainingContent.match(/<(?:p|h[1-6]|blockquote|ul|ol|pre)\b/gi) ?? []
    ).length,
  };
}

/**
 * @param signals
 */
function shouldStripInlineBio(signals: InlineBioSignals): boolean {
  const normalizedLabel = signals.linkedLabel.toLowerCase();
  const normalizedLeadingText = signals.leadingText.toLowerCase();
  const repeatsLinkedLabel = normalizedLeadingText.startsWith(
    `${normalizedLabel} ${normalizedLabel}`,
  );
  const bioMarkerHits = countBioMarkerHits(normalizedLeadingText);
  const looksLikeProfileBio =
    repeatsLinkedLabel ||
    bioMarkerHits >= 2 ||
    (bioMarkerHits >= 1 && signals.hasContactSignal);

  return looksLikeProfileBio && signals.remainingBlockCount >= 2;
}

/**
 * @param parts
 * @param originalHtml
 * @param maxTextLength
 */
function stripOrphanedInlineParts(
  parts: { content: string; type: "gap" | "tag" }[],
  originalHtml: string,
  maxTextLength: number,
): string {
  if (parts.every((part) => part.type === "gap")) return originalHtml;

  let depth = 0;
  let prevTagIsImg = false;

  return parts
    .map((part) => {
      if (part.type === "tag") {
        const nextTagState = updateInlineGapState(part.content, depth);
        depth = nextTagState.depth;
        prevTagIsImg = nextTagState.prevTagIsImg;
        return part.content;
      }

      const nextContent = stripTopLevelInlineGap(
        part.content,
        depth,
        maxTextLength,
        prevTagIsImg,
      );
      prevTagIsImg = false;
      return nextContent;
    })
    .join("");
}

/**
 * @param content
 * @param depth
 * @param maxTextLength
 * @param prevTagIsImg
 */
function stripTopLevelInlineGap(
  content: string,
  depth: number,
  maxTextLength: number,
  prevTagIsImg: boolean,
): string {
  if (depth !== 0 || prevTagIsImg) {
    return content;
  }

  const hasSemanticInline = /<(?:a|strong|em|b|i|u|code)\b/i.test(content);
  if (hasSemanticInline) {
    return content;
  }

  const plainText = content
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const looksLikeProse = wordCount >= 12 || /[.?!"“”]/.test(plainText);

  if (
    plainText.length > 0 &&
    plainText.length <= maxTextLength &&
    !looksLikeProse
  ) {
    return "";
  }

  return content;
}

/**
 * @param tag
 * @param depth
 */
function updateInlineGapState(
  tag: string,
  depth: number,
): { depth: number; prevTagIsImg: boolean } {
  const prevTagIsImg = /^<img\b/i.test(tag);

  if (/^<(?:hr|img)\b/i.test(tag)) {
    return { depth, prevTagIsImg };
  }

  if (/^<\//i.test(tag)) {
    return {
      depth: Math.max(0, depth - 1),
      prevTagIsImg,
    };
  }

  return {
    depth: depth + 1,
    prevTagIsImg,
  };
}
