import Defuddle from "defuddle";
import { parseHTML } from "linkedom";

import type { DistilledArticle, DistillOptions } from "./types";

const DEFAULT_MIN_BODY_LENGTH = 100;
const EMPTY_STYLE = Object.freeze({ getPropertyValue: () => "" });

/**
 * Runs the Defuddle-backed distillation strategy against already-fetched HTML.
 */
export function distillWithDefuddle(
  html: string,
  url: string,
  options?: DistillOptions,
): DistilledArticle | null {
  const threshold = options?.contentLengthThreshold ?? DEFAULT_MIN_BODY_LENGTH;
  const { document } = parseHTML(html);
  patchLinkedomWindow(document);
  const defuddleParser = new Defuddle(document as unknown as Document, { url });
  const distilledArticle = defuddleParser.parse();

  if (distilledArticle.content.trim().length < threshold) return null;

  return {
    content: distilledArticle.content,
    description: distilledArticle.description,
    source: url,
    title: distilledArticle.title,
  };
}

/** Stub browser APIs that linkedom lacks but Defuddle expects. */
function patchLinkedomWindow(document: unknown): void {
  const doc = document as Record<string, unknown>;
  const win = (doc.defaultView as Record<string, unknown> | undefined) ?? doc;
  if (
    !("getComputedStyle" in win) ||
    typeof win.getComputedStyle !== "function"
  ) {
    win.getComputedStyle = () => EMPTY_STYLE;
  }
  if (!("styleSheets" in doc)) {
    doc.styleSheets = [];
  }
}
