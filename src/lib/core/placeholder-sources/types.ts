import type { FeedSource } from "@/lib/core/types";

/** Describes one bundled placeholder article and its local snapshot slug. */
export interface PlaceholderSeed {
  content: string;
  slug: string;
  title: string;
  url: string;
}

/** Compact tuple form used to keep static placeholder manifests readable. */
export type PlaceholderSeedTuple = readonly [
  title: string,
  slug: string,
  url: string,
  content: string,
];

/** Groups a placeholder feed source with the article seeds it exposes in preview mode. */
export interface PlaceholderSourceDefinition {
  basePath: string;
  seeds: PlaceholderSeed[];
  source: FeedSource;
}

/** Converts compact seed tuples into the named records used by the placeholder registry. */
export const createPlaceholderSeeds = (
  entries: readonly PlaceholderSeedTuple[],
): PlaceholderSeed[] =>
  entries.map(([title, slug, url, content]) => ({
    content,
    slug,
    title,
    url,
  }));