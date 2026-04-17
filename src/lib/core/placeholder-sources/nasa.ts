import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-sources/types";

import { NASA_BREAKING_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/breaking";
import { NASA_LEARNING_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/learning";

export const NASA_PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] =
  [NASA_BREAKING_PLACEHOLDER_SOURCE, NASA_LEARNING_PLACEHOLDER_SOURCE];
