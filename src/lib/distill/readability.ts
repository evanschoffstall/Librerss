import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { DistilledArticle, DistillOptions } from "./types";

const DEFAULT_MIN_BODY_LENGTH = 100;

export async function readabilityDistill(
  html: string,
  url: string,
  options?: DistillOptions,
): Promise<DistilledArticle | null> {
  const threshold = options?.contentLengthThreshold ?? DEFAULT_MIN_BODY_LENGTH;
  const { document } = parseHTML(html);
  const reader = new Readability(document, { url } as never);
  const result = reader.parse();

  if (!result?.content || result.content.trim().length < threshold) return null;

  return {
    content: result.content,
    title: result.title ?? undefined,
    description: result.excerpt ?? undefined,
    source: url,
  };
}
