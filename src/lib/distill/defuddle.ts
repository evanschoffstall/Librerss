import Defuddle from "defuddle";
import { parseHTML } from "linkedom";

import type { DistilledArticle, DistillOptions } from "./types";

const DEFAULT_MIN_BODY_LENGTH = 100;
const EMPTY_STYLE = Object.freeze({
  /**
   * Return the property value.
   * @returns The property value.
   */
  getPropertyValue: () => "",
});

/**
 * Process the distill with defuddle.
 * @param html - The html.
 * @param url - The url.
 * @param options - The options used to process the distill with defuddle.
 * @returns The distill with defuddle.
 */
export function distillWithDefuddle(
  html: string,
  url: string,
  options?: DistillOptions,
): DistilledArticle | null {
  const threshold = options?.contentLengthThreshold ?? DEFAULT_MIN_BODY_LENGTH;
  const { document } = parseHTML(html);
  patchLinkedomWindow(document);
  // Linkedom's Document is structurally compatible with the Web API Document at
  // runtime but TypeScript tracks them as distinct types; the cast is unavoidable.
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

/**
 * Process the patch linkedom window.
 * @param document - The document.
 */
function patchLinkedomWindow(document: unknown): void {
  const doc = document as Record<string, unknown>;
  const win = (doc.defaultView as Record<string, unknown> | undefined) ?? doc;
  if (
    !("getComputedStyle" in win) ||
    typeof win.getComputedStyle !== "function"
  ) {
    /**
     * Returns an inert CSSStyleDeclaration-like object for Linkedom documents.
     * @returns The shared empty style shim.
     */
    win.getComputedStyle = () => EMPTY_STYLE;
  }
  if (!("styleSheets" in doc)) {
    doc.styleSheets = [];
  }
}
