import type {
  DistilledArticle,
  DistillOptions,
  DistillStrategy,
} from "./types";

import { defuddleDistill } from "./defuddle";
import { librerssDistill } from "./librerss";
import { readabilityDistill } from "./readability";

/**
 * Distill an article from pre-cleaned HTML using the given strategy.
 *
 * - `librerss`    — built-in heuristic body selection (default)
 * - `readability` — Mozilla Readability via linkedom
 * - `defuddle`    — Defuddle via linkedom
 */
export async function distillArticle(
  html: string,
  url: string,
  strategy: DistillStrategy = "librerss",
  options?: DistillOptions,
): Promise<DistilledArticle | null> {
  switch (strategy) {
    case "defuddle":
      return Promise.resolve(defuddleDistill(html, url, options));
    case "librerss":
      return Promise.resolve(librerssDistill(html, url, options));
    case "readability":
      return Promise.resolve(readabilityDistill(html, url, options));
  }
}
