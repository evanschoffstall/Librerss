import { decodeHtmlEntities, readAttrValue } from "@/lib/sanitize";

/**
 * Ownership signals derived from candidate and page headlines.
 */
export interface PageHeadlineSignals {
  hasExactMatchingPageHeadlineAttribute: boolean;
  hasMatchingPageHeadline: boolean;
  hasMismatchedPageHeadline: boolean;
}

/**
 * Read headline-ownership signals for one candidate against the page title.
 * @param candidateAttrs - Raw opening-tag attributes for the candidate wrapper.
 * @param candidateHtml - Candidate body HTML to inspect for descendant signals.
 * @param pageTitle - Page title signal used to identify the owning article.
 * @param hasExactContentAttributeSignal - Whether the candidate already looks like a direct article body container.
 * @returns Normalized ownership signals for candidate ranking.
 */
export function readPageHeadlineSignals(
  candidateAttrs: string,
  candidateHtml: string,
  pageTitle: null | string,
  hasExactContentAttributeSignal: boolean,
): PageHeadlineSignals {
  const normalizedPageTitle =
    pageTitle === null ? null : normalizeHeadlineForComparison(pageTitle);
  const declaredCandidateHeadline =
    readDeclaredCandidateHeadline(candidateAttrs);
  const candidateHeadline = readCandidateHeadline(
    candidateAttrs,
    candidateHtml,
  );
  const canUsePageTitleMatch =
    hasExactContentAttributeSignal || declaredCandidateHeadline !== null;
  const hasExactMatchingPageHeadlineAttribute =
    normalizedPageTitle !== null &&
    declaredCandidateHeadline !== null &&
    normalizeHeadlineForComparison(declaredCandidateHeadline) ===
      normalizedPageTitle;
  const hasMatchingPageHeadline =
    normalizedPageTitle !== null &&
    canUsePageTitleMatch &&
    candidateHeadline !== null &&
    normalizeHeadlineForComparison(candidateHeadline) === normalizedPageTitle;

  return {
    hasExactMatchingPageHeadlineAttribute,
    hasMatchingPageHeadline,
    hasMismatchedPageHeadline:
      canUsePageTitleMatch &&
      candidateHeadline !== null &&
      !hasMatchingPageHeadline,
  };
}

/**
 * Normalizes page and candidate headlines so ownership comparisons remain
 * stable across entity encoding, punctuation differences, and case changes.
 * @param value - Raw headline text to normalize.
 * @returns Lowercase alphanumeric comparison key for headline ownership.
 */
function normalizeHeadlineForComparison(value: string): string {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Reads the candidate-owned headline signal when the publisher exposes one on
 * the same wrapper as the prose body.
 * @param candidateAttrs - Raw opening-tag attributes for the candidate wrapper.
 * @param candidateHtml - Candidate body HTML to inspect for descendant signals.
 * @returns Candidate headline text when the wrapper or its descendants declare one.
 */
function readCandidateHeadline(
  candidateAttrs: string,
  candidateHtml: string,
): null | string {
  const declaredCandidateHeadline =
    readDeclaredCandidateHeadline(candidateAttrs);
  if (declaredCandidateHeadline !== null) {
    return declaredCandidateHeadline;
  }

  return readDescendantCandidateHeadline(candidateHtml);
}

/**
 * Reads ownership metadata declared directly on a candidate wrapper.
 * @param candidateAttrs - Raw opening-tag attributes for the candidate wrapper.
 * @returns Declared candidate headline when the wrapper owns one.
 */
function readDeclaredCandidateHeadline(candidateAttrs: string): null | string {
  for (const attributeName of ["data-headline", "data-title", "aria-label"]) {
    const attributeValue = readAttrValue(candidateAttrs, attributeName);
    if (attributeValue?.trim()) {
      return decodeHtmlEntities(attributeValue.trim());
    }
  }

  return null;
}

/**
 * Reads descendant ownership metadata and nearby headings inside a candidate.
 * @param candidateHtml - Candidate body HTML to inspect.
 * @returns Candidate headline text when descendants declare one.
 */
function readDescendantCandidateHeadline(candidateHtml: string): null | string {
  for (const match of candidateHtml.matchAll(
    /\b(?:data-headline|data-title|data-page-title)=(['"])([\s\S]*?)\1/gi,
  )) {
    const attributeValue = decodeHtmlEntities(match[2].trim());
    if (attributeValue) {
      return attributeValue;
    }
  }

  for (const match of candidateHtml.matchAll(
    /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi,
  )) {
    const headingText = decodeHtmlEntities(
      match[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (headingText) {
      return headingText;
    }
  }

  return null;
}
