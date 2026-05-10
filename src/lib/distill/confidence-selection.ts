import {
  countUtilityLeadParagraphs,
  isLikelyUtilityLeadParagraph,
  prependNearbyLeadImage,
} from "@/lib/distill/lead";
import { decodeHtmlEntities, readAttrValue } from "@/lib/sanitize";

/** Candidate tags that commonly wrap standalone article prose. */
const CANDIDATE_CONTAINER_TAG_RE = /<(article|main|section|div)\b([^>]*)>/gi;

/** HTML tags that represent readable prose blocks inside a candidate body. */
const PROSE_BLOCK_RE = /<(?:p|blockquote)\b/gi;

/** HTML tags that represent publisher controls or low-signal media cards. */
const CONTROL_TAG_RE = /<(?:button|form|input|select|textarea)\b/gi;

/** HTML tags that carry outbound or related-card link density. */
const LINK_TAG_RE = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;

/** HTML tags that often indicate metadata, taxonomy, or related-card lists. */
const LIST_ITEM_TAG_RE = /<li\b/gi;

/** HTML tags that introduce section headings inside related-card modules. */
const HEADING_TAG_RE = /<h[2-6]\b/gi;

/** HTML tags that may represent media inside a candidate body. */
const IMAGE_TAG_RE = /<img\b[^>]*>/gi;

/** Repeated accordion panels can form a complete index-style content surface. */
const ACCORDION_PANEL_RE = /\bpanel\s+panel-default\b/gi;

/** Repeated explainer items can form one multi-section article body. */
const EXPLAINER_ITEM_RE = /\bexplainer-item\b/gi;

/** Generic interface and engagement words that should lower body confidence. */
const BOILERPLATE_PHRASE_RE =
  /\b(?:accept all cookies|already liked|cookie settings|download|explore case|learn more about|media contact|next press release|press releases?|related|sharing functionality|spokesperson|status|thank you for liking|views?)\b/gi;

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

/** Lowest score ratio allowed when a parent preserves real lead prose. */
const CONTAINING_LEAD_PARENT_SCORE_RATIO = 0.3;

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
  const selectedCandidate = selectBestCandidate(
    collectArticleBodyCandidates(html),
    minLength,
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
 * Finds a near-tie ancestor that adds a real introductory paragraph before the
 * highest-scoring child. CMS pages often split the lead and body into sibling
 * fields, so using the child alone can remove the actual opening paragraph.
 * @param scoredCandidates - Usable candidates sorted by confidence.
 * @param bestCandidate - Highest-scoring candidate before containment review.
 * @returns Near-tie parent candidate when it preserves meaningful lead prose.
 */
function findLeadPreservingContainingCandidate(
  scoredCandidates: ScoredArticleBodyCandidate[],
  bestCandidate: ScoredArticleBodyCandidate,
): null | ScoredArticleBodyCandidate {
  const minimumScore = bestCandidate.score * CONTAINING_LEAD_PARENT_SCORE_RATIO;

  return (
    scoredCandidates.find((scored) => {
      if (scored === bestCandidate || scored.score < minimumScore) {
        return false;
      }

      const parent = scored.candidate;
      const child = bestCandidate.candidate;
      return (
        parent.openIndex < child.openIndex &&
        parent.closeIndex > child.closeIndex &&
        hasMeaningfulLeadProse(parent, child)
      );
    }) ?? null
  );
}

/**
 * Detects schema and CMS markers that identify the actual article text node,
 * not merely a broad page wrapper that happens to contain article-like words.
 * @param attrs - Raw opening-tag attributes for a candidate container.
 * @returns Whether the candidate carries a high-confidence body marker.
 */
function hasExactContentAttributeSignal(attrs: string): boolean {
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
 * Detects whether a containing candidate contributes a substantive lead
 * paragraph before the selected child rather than just headings, bylines, or
 * navigation links.
 * @param parent - Candidate that may wrap the best child candidate.
 * @param child - Best child candidate nested inside the parent.
 * @returns Whether the parent adds a meaningful paragraph before the child.
 */
function hasMeaningfulLeadProse(
  parent: ArticleBodyCandidate,
  child: ArticleBodyCandidate,
): boolean {
  const childOffset = child.openIndex - parent.openIndex;
  const leadingHtml = parent.html.slice(0, Math.max(0, childOffset));
  const paragraphs = [...leadingHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];

  return paragraphs.some((paragraph) => {
    const text = createVisibleText(paragraph[1]);
    if (isLikelyUtilityLeadParagraph(text)) return false;
    return text.length >= 120 && text.split(/\s+/).filter(Boolean).length >= 20;
  });
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
 * Normalizes class and id text so camel-case publisher markers such as
 * `articleBody` and kebab-case markers such as `article-body` compare evenly.
 * @param value - Raw attribute value read from a candidate container.
 * @returns Lowercase searchable attribute text with stable whitespace.
 */
function normalizeAttributeTokens(value: null | string): string {
  return ` ${(value ?? "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()} `;
}

/**
 * Reads the structural and textual evidence used by the body confidence model.
 * @param candidate - Candidate body container to inspect.
 * @param visibleText - Plain visible text for the candidate body.
 * @param linkText - Plain visible text inside links within the candidate body.
 * @returns Scoring signals for the candidate body.
 */
function readArticleBodySignals(
  candidate: ArticleBodyCandidate,
  visibleText: string,
  linkText: string,
): ArticleBodySignals {
  const words = visibleText.split(/\s+/).filter(Boolean);
  const textLength = visibleText.length;
  const utilityParagraphCount = countUtilityLeadParagraphs(
    candidate.html,
    createVisibleText,
  );

  return {
    boilerplateHits: countMatches(visibleText, BOILERPLATE_PHRASE_RE),
    controlCount: countMatches(candidate.html, CONTROL_TAG_RE),
    hasChromeAttributeSignal: CHROME_ATTR_SIGNAL_RE.test(candidate.attrs),
    hasContentAttributeSignal: CONTENT_ATTR_SIGNAL_RE.test(candidate.attrs),
    hasExactContentAttributeSignal: hasExactContentAttributeSignal(
      candidate.attrs,
    ),
    headingCount: countMatches(candidate.html, HEADING_TAG_RE),
    imageCount: countMatches(candidate.html, IMAGE_TAG_RE),
    linkCount: countMatches(candidate.html, LINK_TAG_RE),
    linkDensity: textLength > 0 ? linkText.length / textLength : 1,
    listItemCount: countMatches(candidate.html, LIST_ITEM_TAG_RE),
    paragraphCount: countMatches(candidate.html, PROSE_BLOCK_RE),
    sentenceCount: countMatches(visibleText, /[.!?](?:\s|$)/g),
    textLength,
    utilityParagraphCount,
    wordCount: words.length,
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
    (signals.hasExactContentAttributeSignal ? 180 : 0) +
    (signals.hasContentAttributeSignal ? 60 : 0);
  const boilerplatePenalty = signals.boilerplateHits * 80;
  const chromePenalty =
    (signals.hasChromeAttributeSignal ? 320 : 0) +
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
 * @returns Candidate with normalized evidence and score.
 */
function scoreCandidate(
  candidate: ArticleBodyCandidate,
): ScoredArticleBodyCandidate {
  const visibleText = createVisibleText(candidate.html);
  const linkText = [...candidate.html.matchAll(LINK_TAG_RE)]
    .map((match) => createVisibleText(match[1]))
    .join(" ");
  const signals = readArticleBodySignals(candidate, visibleText, linkText);

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
 * @returns The candidate that should own Librerss extraction, if any.
 */
function selectBestCandidate(
  candidates: ArticleBodyCandidate[],
  minLength: number,
): ArticleBodyCandidate | null {
  const scoredCandidates = candidates
    .map(scoreCandidate)
    .filter((scored) => isUsableCandidate(scored, minLength))
    .sort(
      (left, right) =>
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

  return (
    findLeadPreservingContainingCandidate(scoredCandidates, bestCandidate)
      ?.candidate ?? bestCandidate.candidate
  );
}
