import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-shared";

import { ESA_EARTH_PLACEHOLDER_SOURCE } from "./earth";
import { ESA_HUMAN_PLACEHOLDER_SOURCE } from "./human";
import { ESA_TOP_PLACEHOLDER_SOURCE } from "./top";

export const ESA_PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] =
  [
    ESA_EARTH_PLACEHOLDER_SOURCE,
    ESA_HUMAN_PLACEHOLDER_SOURCE,
    ESA_TOP_PLACEHOLDER_SOURCE,
  ];
