import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-sources/types";

import { ESA_PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources/esa";
import { FEDERAL_PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources/federal-sources";
import { NASA_PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources/nasa";
import { NIH_PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources/nih";
import { STATE_PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources/state-sources";

/** Full placeholder feed catalog used to power database-free preview mode. */
export const PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] = [
  ...FEDERAL_PLACEHOLDER_SOURCE_DEFINITIONS,
  ...STATE_PLACEHOLDER_SOURCE_DEFINITIONS,
  ...NIH_PLACEHOLDER_SOURCE_DEFINITIONS,
  ...ESA_PLACEHOLDER_SOURCE_DEFINITIONS,
  ...NASA_PLACEHOLDER_SOURCE_DEFINITIONS,
];

/** Stable total placeholder article count used by regression tests and tooling. */
export const PLACEHOLDER_ARTICLE_COUNT = PLACEHOLDER_SOURCE_DEFINITIONS.reduce(
  (articleCount, { seeds }) => articleCount + seeds.length,
  0,
);
