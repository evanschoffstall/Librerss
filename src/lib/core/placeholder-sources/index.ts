import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-sources/types";

import { ESA_EARTH_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/esa-earth";
import { ESA_HUMAN_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/esa-human";
import { ESA_IMAGES_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/esa-images";
import { ESA_TOP_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/esa-top";
import { FEDERAL_PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources/federal-sources";
import { NASA_BREAKING_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/nasa-breaking";
import { NASA_IMAGE_OF_DAY_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/nasa-image-of-day";
import { NASA_LEARNING_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/nasa-learning";
import { NHLBI_NEWS_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/nhlbi-news";
import { NIH_NEWS_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/nih-news";
import { NIH_RESEARCH_MATTERS_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/nih-research-matters";
import { NINDS_PRESS_RELEASES_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/ninds-press-releases";
import { STATE_PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources/state-sources";

/** Full placeholder feed catalog used to power database-free preview mode. */
export const PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] = [
  ...FEDERAL_PLACEHOLDER_SOURCE_DEFINITIONS,
  ...STATE_PLACEHOLDER_SOURCE_DEFINITIONS,
  NIH_NEWS_PLACEHOLDER_SOURCE,
  NIH_RESEARCH_MATTERS_PLACEHOLDER_SOURCE,
  NHLBI_NEWS_PLACEHOLDER_SOURCE,
  NINDS_PRESS_RELEASES_PLACEHOLDER_SOURCE,
  ESA_IMAGES_PLACEHOLDER_SOURCE,
  ESA_EARTH_PLACEHOLDER_SOURCE,
  ESA_HUMAN_PLACEHOLDER_SOURCE,
  ESA_TOP_PLACEHOLDER_SOURCE,
  NASA_BREAKING_PLACEHOLDER_SOURCE,
  NASA_IMAGE_OF_DAY_PLACEHOLDER_SOURCE,
  NASA_LEARNING_PLACEHOLDER_SOURCE,
];

/** Stable total placeholder article count used by regression tests and tooling. */
export const PLACEHOLDER_ARTICLE_COUNT = PLACEHOLDER_SOURCE_DEFINITIONS.reduce(
  (articleCount, { seeds }) => articleCount + seeds.length,
  0,
);

export { PLACEHOLDER_CATEGORY } from "./constants";

export type {
  PlaceholderSeed,
  PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";