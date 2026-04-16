import type { PlaceholderSourceDefinition } from "@/lib/core/placeholder-sources/types";

import { FDA_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/fda";
import { NIST_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/nist";
import { NOAA_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/noaa";
import { USGS_PLACEHOLDER_SOURCE } from "@/lib/core/placeholder-sources/usgs";

/** Federal public-domain placeholder feeds used in database-free preview mode. */
export const FEDERAL_PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] =
  [
    USGS_PLACEHOLDER_SOURCE,
    NOAA_PLACEHOLDER_SOURCE,
    FDA_PLACEHOLDER_SOURCE,
    NIST_PLACEHOLDER_SOURCE,
  ];
