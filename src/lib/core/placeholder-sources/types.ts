import type { FeedSource } from "@/lib/types";

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

/**
 * Create the placeholder seeds.
 * @param entries - The entries.
 * @returns The placeholder seeds.
 */
export const createPlaceholderSeeds = (
  entries: readonly PlaceholderSeedTuple[],
): PlaceholderSeed[] =>
  entries.map(([title, slug, url, content]) => ({
    content,
    slug,
    title,
    url,
  }));
