import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-shared";

import { NIH_NEWS_PLACEHOLDER_SOURCE } from "./news";
import { NHLBI_NEWS_PLACEHOLDER_SOURCE } from "./nhlbi-news";
import { NINDS_PRESS_RELEASES_PLACEHOLDER_SOURCE } from "./ninds-press-releases";
import { NIH_RESEARCH_MATTERS_PLACEHOLDER_SOURCE } from "./research-matters";

export const NIH_PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] =
  [
    NIH_NEWS_PLACEHOLDER_SOURCE,
    NIH_RESEARCH_MATTERS_PLACEHOLDER_SOURCE,
    NHLBI_NEWS_PLACEHOLDER_SOURCE,
    NINDS_PRESS_RELEASES_PLACEHOLDER_SOURCE,
  ];
