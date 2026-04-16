import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-sources/types";

import { NIH_NEWS_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/news";
import { NHLBI_NEWS_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/nhlbi-news";
import { NINDS_PRESS_RELEASES_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/ninds-press-releases";
import { NIH_RESEARCH_MATTERS_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/research-matters";

export const NIH_PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] =
  [
    NIH_NEWS_PLACEHOLDER_SOURCE,
    NIH_RESEARCH_MATTERS_PLACEHOLDER_SOURCE,
    NHLBI_NEWS_PLACEHOLDER_SOURCE,
    NINDS_PRESS_RELEASES_PLACEHOLDER_SOURCE,
  ];
