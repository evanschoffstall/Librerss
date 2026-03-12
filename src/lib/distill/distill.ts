import { customDistill } from "./custom";
import { defuddleDistill } from "./defuddle";
import { readabilityDistill } from "./readability";
import type {
  DistilledArticle,
  DistillOptions,
  DistillStrategy,
} from "./types";

/**
 * Distill an article from pre-cleaned HTML using the given strategy.
 *
 * - `custom`      — built-in heuristic body selection (default)
 * - `readability` — Mozilla Readability via linkedom
 * - `defuddle`    — Defuddle via linkedom
 */
export async function distillArticle(
  html: string,
  url: string,
  strategy: DistillStrategy = "custom",
  options?: DistillOptions,
): Promise<DistilledArticle | null> {
  switch (strategy) {
    case "custom":
      return Promise.resolve(customDistill(html, url, options));
    case "defuddle":
      return Promise.resolve(defuddleDistill(html, url, options));
    case "readability":
      return Promise.resolve(readabilityDistill(html, url, options));
  }
}
