import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-shared";
import { PLACEHOLDER_CATEGORY } from "@/lib/core/placeholder-shared";

/** State and local public-information placeholder feeds used in preview mode. */
export const STATE_PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] =
  [
    {
      basePath: "dwr",
      seeds: createPlaceholderSeeds([
        [
          "Local Agencies Across California Continue Advancements Toward Groundwater Sustainability",
          "groundwater-sustainability-advancements",
          "https://water.ca.gov/News/News-Releases/2026/Mar-2026/Local-Agencies-Across-California-Continue-Advancements-Toward-Groundwater-Sustainability",
          "The Department of Water Resources has released the final version of California's Groundwater: Bulletin 118 - Update 2025, the state's most comprehensive report of groundwater monitoring, conditions, and management.",
        ],
        [
          "February Storms Provide a Much-Needed Boost but Statewide Snowpack Remains Below Average",
          "february-storms-snowpack-boost",
          "https://water.ca.gov/News/News-Releases/2026/Feb-2026/February-Storms-Provide-a-Much-Needed-Boost-but-Statewide-Snowpack-Remains-Below-Average",
          "With one month of the season left, critical Northern California watersheds are well below average after DWR's third snow survey of the season at Phillips Station.",
        ],
        [
          "Governor Newsom launches most ambitious water plan in California history",
          "california-water-plan-launch",
          "https://water.ca.gov/News/News-Releases/2026/Feb-2026/Governor-Newsom-launches-most-ambitious-water-plan-in-California-history",
          "For the first time in state history, California has a statewide water supply target of 9 million acre-feet by 2040.",
        ],
        [
          "Dry January Cuts into Early-Season Snowpack Gains",
          "dry-january-snowpack-gains",
          "https://water.ca.gov/News/News-Releases/2026/Jan-2026/Dry-January-Cuts-into-Early-Season-Snowpack-Gains",
          "DWR's second snow survey of the season found statewide snowpack at 59 percent of average for this date after a dry January.",
        ],
        [
          "December Storms Improved Flexibility Allow DWR to Increase State Water Project Allocation",
          "state-water-project-allocation",
          "https://water.ca.gov/News/News-Releases/2026/Jan-2026/December-Storms-Improved-Flexibility-Allow-DWR-to-Increase-State-Water-Project-Allocation",
          "DWR announced an increase to the State Water Project allocation for 2026 after December storms improved flexibility and supply conditions.",
        ],
        [
          "DWR Finalizes Best Management Practices to Help Address Subsidence and Protect California’s Water Infrastructure",
          "subsidence-best-practices",
          "https://water.ca.gov/News/News-Releases/2026/Jan-2026/Best-Management-Practices-to-Help-Address-Subsidence",
          "California's continued partnership with locals will serve as the key to safeguarding groundwater-reliant communities and infrastructure from land sinking.",
        ],
      ]),
      source: {
        category: PLACEHOLDER_CATEGORY,
        extractionDisabled: true,
        id: 5,
        name: "California DWR News",
        url: "https://water.ca.gov/News/News-Releases",
      },
    },
    {
      basePath: "caloes",
      seeds: createPlaceholderSeeds([
        [
          "Smart Giving: Helpful Ways to Support Disaster Survivors | Cal OES News",
          "smart-giving-helpful-ways-to-support-disaster-survivors",
          "https://www.news.caloes.ca.gov/smart-giving-helpful-ways-to-support-disaster-survivors/",
          "Cal OES outlines practical ways people can support disaster survivors through responsible giving after emergencies.",
        ],
      ]),
      source: {
        category: PLACEHOLDER_CATEGORY,
        extractionDisabled: true,
        id: 6,
        name: "Cal OES News",
        url: "https://www.news.caloes.ca.gov/",
      },
    },
    {
      basePath: "earthquake",
      seeds: createPlaceholderSeeds([
        [
          "How It Works – California Earthquake Early Warning",
          "how-it-works",
          "https://www.earthquake.ca.gov/how-it-works/",
          "California Earthquake Early Warning explains how alerts are detected, delivered, and used to give people seconds of warning before shaking arrives.",
        ],
      ]),
      source: {
        category: PLACEHOLDER_CATEGORY,
        extractionDisabled: true,
        id: 7,
        name: "California Earthquake Early Warning",
        url: "https://www.earthquake.ca.gov/",
      },
    },
    {
      basePath: "cgs",
      seeds: createPlaceholderSeeds([
        [
          "Publication Announcements",
          "releases",
          "https://www.conservation.ca.gov/cgs/publications/releases",
          "Release announcements of maps, reports and other publications of the California Geological Survey.",
        ],
      ]),
      source: {
        category: PLACEHOLDER_CATEGORY,
        extractionDisabled: true,
        id: 8,
        name: "California Geological Survey Publications",
        url: "https://www.conservation.ca.gov/cgs/publications/releases",
      },
    },
  ];
