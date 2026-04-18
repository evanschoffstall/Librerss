import { normalizeArticleHtmlSpacing } from "./cleaners";

const LEADING_WHITESPACE_RE = /^\s+/;
const LEADING_ANCHOR_OPEN_RE = /^<a\b[^>]*>\s*/i;
const LEADING_IMAGE_RE = /^<img\b[^>]*\/?>(?:\s*)/i;
const LEADING_ANCHOR_CLOSE_RE = /^<\/a>\s*/i;
const LEADING_HEADING_RE = /^<h[2-4]\b[^>]*>[\s\S]*?<\/h[2-4]>\s*/i;

interface LeadMediaPrefix {
  consumedLength: number;
  headingBlock: string;
  imagePrefix: string;
}

/**
 * Process the remove leading duplicate image.
 * @param content - The content.
 * @returns The remove leading duplicate image.
 */
export function removeLeadingDuplicateImage(content: string): string {
  const { imagePrefix } = parseLeadMediaAndHeadingPrefix(content);
  if (!imagePrefix.trim()) return content;

  const firstSrc = normalizeImageSource(readFirstImageSource(content));
  if (!firstSrc) return content;

  const afterLeadImage = content.slice(imagePrefix.length);
  const imageSrcMatches = [
    ...afterLeadImage.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi),
  ].map((match) => normalizeImageSource(match[1]));

  return imageSrcMatches.includes(firstSrc)
    ? normalizeArticleHtmlSpacing(afterLeadImage)
    : content;
}

/**
 * Process the strip lead media boilerplate headings.
 * @param content - The content.
 * @param isShortHeadingLabel - Whether is short heading label.
 * @param normalizeHeadingText - The callback that heading text.
 * @returns The strip lead media boilerplate headings.
 */
export function stripLeadMediaBoilerplateHeadings(
  content: string,
  isShortHeadingLabel: (text: string) => boolean,
  normalizeHeadingText: (value: string) => string,
): string {
  const { consumedLength, headingBlock, imagePrefix } =
    parseLeadMediaAndHeadingPrefix(content);
  if (!headingBlock) return content;

  const headings =
    headingBlock.match(/<h[2-4]\b[^>]*>[\s\S]*?<\/h[2-4]>/gi) ?? [];
  if (
    headings.length < 2 ||
    !headings.every((heading) =>
      isShortHeadingLabel(normalizeHeadingText(heading)),
    )
  ) {
    return content;
  }

  return normalizeArticleHtmlSpacing(
    [imagePrefix, content.slice(consumedLength)].filter(Boolean).join("\n"),
  );
}

/**
 * Process the consume leading image segment.
 * @param content - The content.
 * @param cursor - The cursor.
 * @returns The consume leading image segment.
 */
function consumeLeadingImageSegment(
  content: string,
  cursor: number,
): null | {
  nextCursor: number;
  segment: string;
} {
  let nextCursor = cursor;
  let segment = "";

  const anchorOpen = consumeLeadingToken(
    content.slice(nextCursor),
    LEADING_ANCHOR_OPEN_RE,
  );
  if (anchorOpen) {
    segment += anchorOpen;
    nextCursor += anchorOpen.length;
  }

  const imageTag = consumeLeadingToken(
    content.slice(nextCursor),
    LEADING_IMAGE_RE,
  );
  if (!imageTag) {
    return null;
  }

  segment += imageTag;
  nextCursor += imageTag.length;

  if (!anchorOpen) {
    return { nextCursor, segment };
  }

  const anchorClose = consumeLeadingToken(
    content.slice(nextCursor),
    LEADING_ANCHOR_CLOSE_RE,
  );
  if (anchorClose) {
    segment += anchorClose;
    nextCursor += anchorClose.length;
  }

  return { nextCursor, segment };
}

/**
 * Process the consume leading token.
 * @param source - The source.
 * @param tokenRe - The token re.
 * @returns The consume leading token.
 */
function consumeLeadingToken(source: string, tokenRe: RegExp): string {
  return tokenRe.exec(source)?.[0] ?? "";
}

/**
 * Normalize the image source.
 * @param source - The source.
 * @returns The image source.
 */
function normalizeImageSource(source: string): string {
  const normalized = source.trim().replace(/&amp;/g, "&");
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return normalized.split(/[?#]/, 1)[0] ?? "";
  }
}

/**
 * Parse the lead media and heading prefix.
 * @param content - The content.
 * @returns The lead media and heading prefix.
 */
function parseLeadMediaAndHeadingPrefix(content: string): LeadMediaPrefix {
  let cursor = 0;
  let imagePrefix = "";
  let headingBlock = "";

  const leadingWhitespace = consumeLeadingToken(
    content.slice(cursor),
    LEADING_WHITESPACE_RE,
  );
  imagePrefix += leadingWhitespace;
  cursor += leadingWhitespace.length;

  for (;;) {
    const imageSegment = consumeLeadingImageSegment(content, cursor);
    if (!imageSegment) {
      break;
    }

    cursor = imageSegment.nextCursor;
    imagePrefix += imageSegment.segment;
  }

  for (;;) {
    const heading = consumeLeadingToken(
      content.slice(cursor),
      LEADING_HEADING_RE,
    );
    if (!heading) break;
    headingBlock += heading;
    cursor += heading.length;
  }

  return { consumedLength: cursor, headingBlock, imagePrefix };
}

/**
 * Process the read first image source.
 * @param content - The content.
 * @returns The read first image source.
 */
function readFirstImageSource(content: string): string {
  const { imagePrefix } = parseLeadMediaAndHeadingPrefix(content);
  const imageTag = /<img\b[^>]*>/i.exec(imagePrefix)?.[0];
  if (!imageTag) return "";
  const srcMatch = /\bsrc=["']([^"']+)["']/i.exec(imageTag);
  return (srcMatch?.[1] ?? "").trim();
}
