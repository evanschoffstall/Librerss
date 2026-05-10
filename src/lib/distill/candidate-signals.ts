import { readAttrValue } from "@/lib/sanitize";

/** Class and id patterns that strongly identify the article text itself. */
const EXACT_CONTENT_ATTR_PATTERNS = [
  "articlebody",
  "article-body",
  "article__body",
  "article-content",
  "article__content",
  "body-content",
  "content-body",
  "entry-content",
  "entry__content",
  "field--name-body",
  "field-name-body",
  "post-content",
  "post__content",
  "story-content",
  "story__content",
] as const;

const HEADING_TAG_RE = /<h[2-6]\b/gi;
const IMAGE_TAG_RE = /<img\b[^>]*>/gi;
const LINK_TAG_RE = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
const LIST_ITEM_TAG_RE = /<li\b/gi;
const PROSE_BLOCK_RE = /<(?:p|blockquote)\b/gi;
const SENTENCE_END_RE = /[.!?](?:\s|$)/g;

/**
 * Structural metrics read from a candidate body.
 */
export interface CandidateStructureMetrics {
  headingCount: number;
  imageCount: number;
  linkCount: number;
  linkDensity: number;
  listItemCount: number;
  paragraphCount: number;
  sentenceCount: number;
}

/**
 * Detect schema and CMS markers that identify the actual article text node.
 * @param attrs - Raw opening-tag attributes for a candidate container.
 * @returns Whether the candidate carries a high-confidence body marker.
 */
export function hasExactContentAttributeSignal(attrs: string): boolean {
  if (readAttrValue(attrs, "itemprop") === "articleBody") return true;

  const classValue = normalizeAttributeTokens(readAttrValue(attrs, "class"));
  const idValue = normalizeAttributeTokens(readAttrValue(attrs, "id"));

  return EXACT_CONTENT_ATTR_PATTERNS.some(
    (pattern) =>
      classValue.includes(pattern) ||
      idValue.includes(pattern) ||
      classValue.includes(pattern.replaceAll("-", "")) ||
      idValue.includes(pattern.replaceAll("-", "")),
  );
}

/**
 * Read the structural metrics that contribute to candidate confidence.
 * @param candidateHtml - Candidate body HTML to measure.
 * @param visibleText - Plain visible text extracted from the candidate body.
 * @param linkText - Plain visible link text extracted from the candidate body.
 * @param textLength - Visible text length for the candidate body.
 * @returns Structural metrics used during confidence scoring.
 */
export function readCandidateStructureMetrics(
  candidateHtml: string,
  visibleText: string,
  linkText: string,
  textLength: number,
): CandidateStructureMetrics {
  return {
    headingCount: countMatches(candidateHtml, HEADING_TAG_RE),
    imageCount: countMatches(candidateHtml, IMAGE_TAG_RE),
    linkCount: countMatches(candidateHtml, LINK_TAG_RE),
    linkDensity: textLength > 0 ? linkText.length / textLength : 1,
    listItemCount: countMatches(candidateHtml, LIST_ITEM_TAG_RE),
    paragraphCount: countMatches(candidateHtml, PROSE_BLOCK_RE),
    sentenceCount: countMatches(visibleText, SENTENCE_END_RE),
  };
}

/**
 * Counts every match for a regular expression without relying on shared global
 * state across calls.
 * @param value - Text or HTML fragment to inspect.
 * @param pattern - Global regular expression to count.
 * @returns Number of matches in the supplied value.
 */
function countMatches(value: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(value) !== null) count++;
  pattern.lastIndex = 0;
  return count;
}

/**
 * Normalize class and id text so camel-case and kebab-case markers compare
 * evenly.
 * @param value - Raw attribute value read from a candidate container.
 * @returns Lowercase searchable attribute text with stable whitespace.
 */
function normalizeAttributeTokens(value: null | string): string {
  return ` ${(value ?? "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()} `;
}
