import {
  hasExactContentAttributeSignal,
  readCandidateStructureMetrics,
} from "@/lib/distill/candidate-signals";
import { countBoilerplateSignals } from "@/lib/distill/chrome";
import { readPageHeadlineSignals } from "@/lib/distill/headline-ownership";
import {
  countUtilityLeadParagraphs,
  findLeadPreservingContainingCandidate,
  prependNearbyLeadImage,
  readMeaningfulLeadProse,
} from "@/lib/distill/lead";
import { decodeHtmlEntities, parsePageTitle } from "@/lib/sanitize";

/** Candidate tags that commonly wrap standalone article prose. */
const CANDIDATE_CONTAINER_TAG_RE = /<(article|main|section|div)\b([^>]*)>/gi;

/** HTML tags that represent publisher controls or low-signal media cards. */
const CONTROL_TAG_RE = /<(?:button|form|input|select|textarea)\b/gi;

/** HTML tags that carry outbound or related-card link density. */
const LINK_TAG_RE = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;

/** Repeated accordion panels can form a complete index-style content surface. */
const ACCORDION_PANEL_RE = /\bpanel\s+panel-default\b/gi;

/** Repeated explainer items can form one multi-section article body. */
const EXPLAINER_ITEM_RE = /\bexplainer-item\b/gi;

/** Class and id words that usually identify useful article text containers. */
const CONTENT_ATTR_SIGNAL_RE =
  /\b(?:article|body|content|description|entry|main|post|story|text)\b/i;

/** Class and id words that identify collapsible UI panels instead of articles. */
const CHROME_ATTR_SIGNAL_RE =
  /\b(?:accordion|collapse|dialog-off-canvas|panel(?:\s|-)?(?:body|collapse|default))\b/i;

/** Highest word count that continues to add confidence. */
const PROSE_WORD_SCORE_CAP = 450;

/** Highest paragraph count that continues to add confidence. */
const PROSE_PARAGRAPH_SCORE_CAP = 12;

/** Highest sentence count that continues to add confidence. */
const PROSE_SENTENCE_SCORE_CAP = 35;

/** Minimum score required before the confidence fallback can own extraction. */
const MIN_CONFIDENT_BODY_SCORE = 120;

/** Extracted candidate body with enough source position to recover lead media. */
interface ArticleBodyCandidate {
  attrs: string;
  closeIndex: number;
  html: string;
  openIndex: number;
  tagName: string;
}

/** Numeric evidence used to compare possible article containers. */
interface ArticleBodySignals {
  boilerplateHits: number;
  controlCount: number;
  hasChromeAttributeSignal: boolean;
  hasContentAttributeSignal: boolean;
  hasExactContentAttributeSignal: boolean;
  hasExactMatchingPageHeadlineAttribute: boolean;
  hasMatchingPageHeadline: boolean;
  hasMismatchedPageHeadline: boolean;
  headingCount: number;
  imageCount: number;
  linkCount: number;
  linkDensity: number;
  listItemCount: number;
  paragraphCount: number;
  sentenceCount: number;
  textLength: number;
  utilityParagraphCount: number;
  wordCount: number;
}

/** Candidate body paired with its computed confidence score. */
interface ScoredArticleBodyCandidate {
  candidate: ArticleBodyCandidate;
  score: number;
  signals: ArticleBodySignals;
}

/**
 * Selects a high-confidence article body when semantic selectors cannot find
 * one. The scorer favors prose-dense, low-link containers over whole-page
 * wrappers that leak cookie prompts, like controls, download affordances, and
 * related-card grids into the reader output.
 * @param html - Pre-cleaned upstream document HTML submitted to Librerss distillation.
 * @param minLength - Minimum visible text length required by the caller.
 * @returns The selected body HTML, optionally prefixed with a nearby lead image.
 */
export function findConfidentArticleBody(
  html: string,
  minLength: number,
): null | string {
  const pageTitle = parsePageTitle(html);
  const selectedCandidate = selectBestCandidate(
    collectArticleBodyCandidates(html),
    minLength,
    pageTitle,
  );

  return selectedCandidate
    ? prependNearbyLeadImage(
        html,
        selectedCandidate.html,
        selectedCandidate.openIndex,
      )
    : null;
}

/**
 * Collects candidate containers while preserving their original source offsets
 * so neighboring lead media can be recovered after a prose block is selected.
 * @param html - Pre-cleaned upstream document HTML to inspect.
 * @returns Candidate article containers found in source order.
 */
function collectArticleBodyCandidates(html: string): ArticleBodyCandidate[] {
  const candidates: ArticleBodyCandidate[] = [];
  let match: null | RegExpExecArray;

  while ((match = CANDIDATE_CONTAINER_TAG_RE.exec(html)) !== null) {
    const extracted = extractInnerHtml(
      html,
      match.index,
      match[0].length,
      match[1],
    );
    if (extracted === null) continue;

    candidates.push({
      attrs: match[2],
      closeIndex: extracted.closeIndex,
      html: extracted.html,
      openIndex: match.index,
      tagName: match[1],
    });
  }

  return candidates;
}

/**
 * Counts every match for a regular expression without relying on mutable global
 * state outside the current call.
 * @param value - Text or HTML fragment to inspect.
 * @param pattern - Global or non-global regular expression to count.
 * @returns Number of matches in the supplied value.
 */
function countMatches(value: string, pattern: RegExp): number {
  if (!pattern.global) {
    throw new Error("countMatches requires a global regular expression.");
  }

  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(value) !== null) count++;
  pattern.lastIndex = 0;
  return count;
}

/**
 * Removes markup and decodes entities so confidence scoring is based on visible
 * reader text rather than HTML structure.
 * @param html - Candidate HTML fragment to flatten.
 * @returns Normalized visible text for scoring.
 */
function createVisibleText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * Extracts an element body while tracking nesting of the same tag name.
 * @param html - Full source HTML.
 * @param startIndex - Index of the opening tag.
 * @param openTagLength - Length of the matched opening tag.
 * @param tagName - Container tag name to balance.
 * @returns Inner HTML when a matching closing tag is found.
 */
function extractInnerHtml(
  html: string,
  startIndex: number,
  openTagLength: number,
  tagName: string,
): null | { closeIndex: number; html: string } {
  const afterOpen = startIndex + openTagLength;
  const tagNameLower = tagName.toLowerCase();
  const tagRe = /<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi;
  tagRe.lastIndex = afterOpen;
  let depth = 1;
  let match: null | RegExpExecArray;

  while (depth > 0 && (match = tagRe.exec(html)) !== null) {
    if (match[1].toLowerCase() !== tagNameLower) continue;
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      return {
        closeIndex: match.index,
        html: html.slice(afterOpen, match.index),
      };
    }
  }

  return null;
}

/**
 * Finds a containing wrapper when repeated content items form one article body.
 * @param candidates - Candidate article containers in source order.
 * @param bestCandidate - Highest-scoring candidate inside the repeated group.
 * @param repeatedItemRe - Pattern identifying repeated content item markers.
 * @param preferInnermost - Whether to prefer the nearest wrapper over the broadest wrapper.
 * @returns Containing repeated group, or null for ordinary articles.
 */
function findContainingRepeatedGroup(
  candidates: ArticleBodyCandidate[],
  bestCandidate: ArticleBodyCandidate,
  repeatedItemRe: RegExp,
  preferInnermost: boolean,
): ArticleBodyCandidate | null {
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.openIndex < bestCandidate.openIndex &&
          candidate.closeIndex > bestCandidate.closeIndex &&
          countMatches(candidate.html, repeatedItemRe) >= 4,
      )
      .sort((left, right) =>
        preferInnermost
          ? left.html.length - right.html.length ||
            right.openIndex - left.openIndex
          : right.openIndex - left.openIndex ||
            left.html.length - right.html.length,
      )[0] ?? null
  );
}

/**
 * Applies minimum confidence gates so the fallback does not select tiny cards,
 * captions, or list-heavy related modules just because they have a class match.
 * @param scored - Scored candidate body to check.
 * @param minLength - Minimum visible text length required by the caller.
 * @returns Whether the candidate is strong enough to use for extraction.
 */
function isUsableCandidate(
  scored: ScoredArticleBodyCandidate,
  minLength: number,
): boolean {
  const { signals } = scored;
  const minimumWordCount = signals.hasExactContentAttributeSignal ? 12 : 35;
  const minimumScore = signals.hasExactContentAttributeSignal
    ? MIN_CONFIDENT_BODY_SCORE - 40
    : MIN_CONFIDENT_BODY_SCORE;
  return (
    signals.textLength >= minLength &&
    signals.wordCount >= minimumWordCount &&
    signals.paragraphCount >= 2 &&
    signals.linkDensity < 0.55 &&
    scored.score >= minimumScore
  );
}

/**
 * Returns whether a normalized word list contains any token from a signal set.
 * @param words - Normalized candidate words.
 * @param signals - Signal tokens that increase chrome confidence.
 * @returns Whether any normalized word belongs to the signal set.
 */

/**
 * Reads the structural and textual evidence used by the body confidence model.
 * @param candidate - Candidate body container to inspect.
 * @param visibleText - Plain visible text for the candidate body.
 * @param linkText - Plain visible text inside links within the candidate body.
 * @param pageTitle - Normalized page title signal used to identify the owning article.
 * @returns Scoring signals for the candidate body.
 */
function readArticleBodySignals(
  candidate: ArticleBodyCandidate,
  visibleText: string,
  linkText: string,
  pageTitle: null | string,
): ArticleBodySignals {
  const wordCount = visibleText.split(/\s+/).filter(Boolean).length;
  const textLength = visibleText.length;
  const utilityParagraphCount = countUtilityLeadParagraphs(
    candidate.html,
    createVisibleText,
  );
  const hasExactBodySignal = hasExactContentAttributeSignal(candidate.attrs);
  const headlineSignals = readPageHeadlineSignals(
    candidate.attrs,
    candidate.html,
    pageTitle,
    hasExactBodySignal,
  );
  const structuralMetrics = readCandidateStructureMetrics(
    candidate.html,
    visibleText,
    linkText,
    textLength,
  );

  return {
    boilerplateHits: countBoilerplateSignals(visibleText),
    controlCount: countMatches(candidate.html, CONTROL_TAG_RE),
    hasChromeAttributeSignal: CHROME_ATTR_SIGNAL_RE.test(candidate.attrs),
    hasContentAttributeSignal: CONTENT_ATTR_SIGNAL_RE.test(candidate.attrs),
    hasExactContentAttributeSignal: hasExactBodySignal,
    ...headlineSignals,
    ...structuralMetrics,
    textLength,
    utilityParagraphCount,
    wordCount,
  };
}

/**
 * Computes a confidence score that rewards prose and penalizes chrome density.
 * @param signals - Normalized evidence for a candidate body.
 * @returns Body confidence score; higher values are better.
 */
function scoreArticleBodySignals(signals: ArticleBodySignals): number {
  const proseScore =
    Math.min(signals.wordCount, PROSE_WORD_SCORE_CAP) +
    Math.min(signals.paragraphCount, PROSE_PARAGRAPH_SCORE_CAP) * 30 +
    Math.min(signals.sentenceCount, PROSE_SENTENCE_SCORE_CAP) * 8 +
    (signals.hasExactMatchingPageHeadlineAttribute ? 320 : 0) +
    (signals.hasMatchingPageHeadline ? 520 : 0) +
    (signals.hasExactContentAttributeSignal ? 180 : 0) +
    (signals.hasContentAttributeSignal ? 60 : 0);
  const boilerplatePenalty = signals.boilerplateHits * 80;
  const chromePenalty =
    (signals.hasChromeAttributeSignal ? 320 : 0) +
    (signals.hasMismatchedPageHeadline ? 180 : 0) +
    signals.controlCount * 45 +
    signals.headingCount * 14 +
    signals.imageCount * 12 +
    signals.linkCount * 10 +
    signals.linkDensity * 120 +
    signals.listItemCount * 22 +
    signals.utilityParagraphCount * 140;

  return proseScore - boilerplatePenalty - chromePenalty;
}

/**
 * Converts text and structure signals into one confidence score.
 * @param candidate - Candidate body container to measure.
 * @param pageTitle - Normalized page title signal used during ownership scoring.
 * @returns Candidate with normalized evidence and score.
 */
function scoreCandidate(
  candidate: ArticleBodyCandidate,
  pageTitle: null | string,
): ScoredArticleBodyCandidate {
  const visibleText = createVisibleText(candidate.html);
  const linkText = [...candidate.html.matchAll(LINK_TAG_RE)]
    .map((match) => createVisibleText(match[1]))
    .join(" ");
  const signals = readArticleBodySignals(
    candidate,
    visibleText,
    linkText,
    pageTitle,
  );

  return {
    candidate,
    score: scoreArticleBodySignals(signals),
    signals,
  };
}

/**
 * Finds the highest-scoring candidate that clears the minimum confidence gates.
 * @param candidates - Candidate article containers in source order.
 * @param minLength - Minimum visible text length required by the caller.
 * @param pageTitle - Normalized page title signal used to prefer the owning article wrapper.
 * @returns The candidate that should own Librerss extraction, if any.
 */
function selectBestCandidate(
  candidates: ArticleBodyCandidate[],
  minLength: number,
  pageTitle: null | string,
): ArticleBodyCandidate | null {
  const scoredCandidates = candidates
    .map((candidate) => scoreCandidate(candidate, pageTitle))
    .filter((scored) => isUsableCandidate(scored, minLength))
    .sort(
      (left, right) =>
        Number(right.signals.hasExactMatchingPageHeadlineAttribute) -
          Number(left.signals.hasExactMatchingPageHeadlineAttribute) ||
        Number(right.signals.hasMatchingPageHeadline) -
          Number(left.signals.hasMatchingPageHeadline) ||
        Number(right.signals.hasExactContentAttributeSignal) -
          Number(left.signals.hasExactContentAttributeSignal) ||
        right.score - left.score ||
        left.signals.textLength - right.signals.textLength,
    );

  if (scoredCandidates.length === 0) return null;
  const bestCandidate = scoredCandidates[0];

  if (bestCandidate.signals.hasChromeAttributeSignal) {
    const repeatedPanelGroup = findContainingRepeatedGroup(
      candidates,
      bestCandidate.candidate,
      ACCORDION_PANEL_RE,
      false,
    );
    if (repeatedPanelGroup) return repeatedPanelGroup;
  }

  const repeatedExplainerGroup = findContainingRepeatedGroup(
    candidates,
    bestCandidate.candidate,
    EXPLAINER_ITEM_RE,
    true,
  );
  if (repeatedExplainerGroup) return repeatedExplainerGroup;

  const leadPreservingParent = findLeadPreservingContainingCandidate(
    candidates,
    bestCandidate.candidate,
    createVisibleText,
  );
  if (leadPreservingParent !== null) {
    const preservedLeadProse = readMeaningfulLeadProse(
      leadPreservingParent,
      bestCandidate.candidate,
      createVisibleText,
    );
    if (preservedLeadProse !== null) {
      return {
        ...bestCandidate.candidate,
        html: `${preservedLeadProse}${bestCandidate.candidate.html}`,
      };
    }
  }

  return bestCandidate.candidate;
}
