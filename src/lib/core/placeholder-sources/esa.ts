import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-sources/types";

import { ESA_EARTH_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/earth";
import { ESA_HUMAN_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/human";
import { ESA_TOP_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/top";

export const ESA_PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] =
  [
    ESA_EARTH_PLACEHOLDER_SOURCE,
    ESA_HUMAN_PLACEHOLDER_SOURCE,
    ESA_TOP_PLACEHOLDER_SOURCE,
  ];
