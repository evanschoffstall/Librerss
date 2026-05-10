import {
  countUtilityLeadParagraphs,
  isLikelyUtilityLeadParagraph,
} from "@/lib/distill/lead";

const IMAGE_TAG_RE = /<img\b[^>]*>/gi;
const LIST_ITEM_TAG_RE = /<li\b/gi;

/**
 * Candidate shape needed for lead-preservation checks.
 */
export interface LeadPreservationCandidate {
  closeIndex: number;
  html: string;
  openIndex: number;
}

/**
 * Find the nearest containing candidate that contributes validated lead prose.
 * @param candidates - Candidate article containers that may contain the best child.
 * @param bestCandidate - Highest-scoring candidate before lead-preservation review.
 * @param createVisibleText - Helper that converts candidate HTML into visible text.
 * @returns Parent candidate when it contributes meaningful lead prose.
 */
export function findLeadPreservingContainingCandidate(
  candidates: LeadPreservationCandidate[],
  bestCandidate: LeadPreservationCandidate,
  createVisibleText: (html: string) => string,
): LeadPreservationCandidate | null {
  return (
    candidates.find((candidate) => {
      if (candidate === bestCandidate) {
        return false;
      }

      return (
        candidate.openIndex < bestCandidate.openIndex &&
        candidate.closeIndex > bestCandidate.closeIndex &&
        readMeaningfulLeadProse(candidate, bestCandidate, createVisibleText) !==
          null
      );
    }) ?? null
  );
}

/**
 * Read validated lead prose that appears before a selected child body.
 * @param parent - Candidate that may contribute introductory lead prose.
 * @param child - Selected child candidate whose body should keep the lead.
 * @param createVisibleText - Helper that converts candidate HTML into visible text.
 * @returns Meaningful lead prose HTML when it should be merged into the child.
 */
export function readMeaningfulLeadProse(
  parent: LeadPreservationCandidate,
  child: LeadPreservationCandidate,
  createVisibleText: (html: string) => string,
): null | string {
  const childOffset = child.openIndex - parent.openIndex;
  const leadingHtml = parent.html.slice(0, Math.max(0, childOffset));
  const paragraphs = [...leadingHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const substantiveParagraphs = paragraphs.filter((paragraph) => {
    const text = createVisibleText(paragraph[1]);
    if (isLikelyUtilityLeadParagraph(text)) return false;
    return text.length >= 120 && text.split(/\s+/).filter(Boolean).length >= 20;
  });

  if (substantiveParagraphs.length === 0) {
    return null;
  }

  const imageCount = countMatches(leadingHtml, IMAGE_TAG_RE);
  const listItemCount = countMatches(leadingHtml, LIST_ITEM_TAG_RE);
  if (
    imageCount >= 2 ||
    (imageCount >= 1 && listItemCount >= 1) ||
    countUtilityLeadParagraphs(leadingHtml, createVisibleText) >= 1
  ) {
    return null;
  }

  return substantiveParagraphs.map((paragraph) => paragraph[0]).join("");
}

/**
 * Count every match for a global regular expression.
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
