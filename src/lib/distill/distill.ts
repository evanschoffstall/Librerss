import type {
  DistilledArticle,
  DistillOptions,
  DistillStrategy,
} from "./types";

import { distillWithDefuddle } from "./defuddle";
import { heuristicDistill } from "./heuristic";
import { readabilityDistill } from "./readability";

/**
 * Process the distill article.
 * @param html - The html.
 * @param url - The url.
 * @param strategy - The strategy.
 * @param options - The options used to process the distill article.
 * @returns The distill article.
 */
export async function distillArticle(
  html: string,
  url: string,
  strategy: DistillStrategy = "librerss",
  options?: DistillOptions,
): Promise<DistilledArticle | null> {
  switch (strategy) {
    case "defuddle":
      return Promise.resolve(distillWithDefuddle(html, url, options));
    case "librerss":
      return Promise.resolve(heuristicDistill(html, url, options));
    case "readability":
      return Promise.resolve(readabilityDistill(html, url, options));
  }
}
