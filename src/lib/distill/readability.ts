import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import type { DistilledArticle, DistillOptions } from "./types";

const DEFAULT_MIN_BODY_LENGTH = 100;

/**
 * Process the readability distill.
 * @param html - The html.
 * @param url - The url.
 * @param options - The options used to process the readability distill.
 * @returns The readability distill.
 */
export function readabilityDistill(
  html: string,
  url: string,
  options?: DistillOptions,
): DistilledArticle | null {
  const threshold = options?.contentLengthThreshold ?? DEFAULT_MIN_BODY_LENGTH;
  const { document } = parseHTML(html);
  const reader = new Readability(document, { url } as never);
  const result = reader.parse();

  if (!result?.content || result.content.trim().length < threshold) return null;

  return {
    content: result.content,
    description: result.excerpt ?? undefined,
    source: url,
    title: result.title ?? undefined,
  };
}
