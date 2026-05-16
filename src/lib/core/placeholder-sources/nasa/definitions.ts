import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-shared";

import { NASA_BREAKING_PLACEHOLDER_SOURCE } from "./breaking";
import { NASA_LEARNING_PLACEHOLDER_SOURCE } from "./learning";

export const NASA_PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] =
  [NASA_BREAKING_PLACEHOLDER_SOURCE, NASA_LEARNING_PLACEHOLDER_SOURCE];
