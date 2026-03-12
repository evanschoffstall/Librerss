import Defuddle from "defuddle";
import { parseHTML } from "linkedom";

import type { DistilledArticle, DistillOptions } from "./types";

const DEFAULT_MIN_BODY_LENGTH = 100;
const EMPTY_STYLE = Object.freeze({ getPropertyValue: () => "" });

export async function defuddleDistill(
  html: string,
  url: string,
  options?: DistillOptions,
): Promise<DistilledArticle | null> {
  const threshold = options?.contentLengthThreshold ?? DEFAULT_MIN_BODY_LENGTH;
  const { document } = parseHTML(html);
  patchLinkedomWindow(document);
  const defuddle = new Defuddle(document as unknown as Document, { url });
  const result = defuddle.parse();

  if (!result?.content || result.content.trim().length < threshold) return null;

  return {
    content: result.content,
    description: result.description || undefined,
    source: url,
    title: result.title || undefined,
  };
}

/** Stub browser APIs that linkedom lacks but Defuddle expects. */
function patchLinkedomWindow(document: unknown): void {
  const doc = document as Record<string, unknown>;
  const win = (doc.defaultView as Record<string, unknown> | undefined) ?? doc;
  if (typeof win.getComputedStyle !== "function") {
    win.getComputedStyle = () => EMPTY_STYLE;
  }
  if (!doc.styleSheets) {
    doc.styleSheets = [];
  }
}
