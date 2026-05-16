import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-shared";
import { PLACEHOLDER_CATEGORY } from "@/lib/core/placeholder-shared";

/** USGS placeholder feed used in database-free preview mode. */
export const USGS_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "usgs",
  seeds: createPlaceholderSeeds([
    [
      "Media Alert: Low-level airplane and helicopter flights to scan geology over southern, central New Mexico",
      "new-mexico-geology-scan",
      "https://www.usgs.gov/news/state-news-release/media-alert-low-level-airplane-and-helicopter-flights-scan-geology-over",
      "RESTON, Va. — The U.S. Geological Survey plans low-level flights by airplane and helicopter over southern and central New Mexico to image geology using airborne geophysical technology.",
    ],
    [
      "Value of U.S. mineral production rose last year, driven by precious metals prices",
      "mineral-production-rose",
      "https://www.usgs.gov/news/national-news-release/value-us-mineral-production-rose-last-year-driven-precious-metals-prices",
      "The USGS releases Mineral Commodity Summaries 2026, the first and most authoritative source for mineral production, trade and consumption data.",
    ],
    [
      "Low-level helicopter flights to image geology over Wyoming and Colorado",
      "wyoming-colorado-helicopter-survey",
      "https://www.usgs.gov/news/state-news-release/low-level-helicopter-flights-image-geology-over-wyoming-and-colorado-0",
      "RESTON, Va. — Low-level helicopter flights are planned over areas of Wyoming and northern Colorado to image geology using airborne geophysical technology for up to one month.",
    ],
    [
      "USGS releases assessment of undiscovered oil and gas resources in Woodford and Barnett shales",
      "woodford-barnett-assessment",
      "https://www.usgs.gov/news/national-news-release/usgs-releases-assessment-undiscovered-oil-and-gas-resources-woodford-and",
      "RESTON, Va. — The U.S. Geological Survey released its assessment of undiscovered gas and oil in the Woodford and Barnett shales in the Permian Basin.",
    ],
    [
      "Media Alert: Low-level flights to image geology and aquifers over parts of New Mexico and Texas",
      "new-mexico-texas-aquifers",
      "https://www.usgs.gov/news/state-news-release/media-alert-low-level-flights-image-geology-and-aquifers-over-parts-new",
      "RESTON, Va. — Low-level helicopter flights are planned over parts of eastern New Mexico and western Texas to image geology and aquifers using airborne geophysical technology.",
    ],
    [
      "USGS releases assessment of undiscovered gas resources in Gulf Coast’s Haynesville Formation",
      "haynesville-gas-assessment",
      "https://www.usgs.gov/news/national-news-release/usgs-releases-assessment-undiscovered-gas-resources-gulf-coasts",
      "RESTON, Va. — The U.S. Geological Survey released its assessment of potential for undiscovered gas and oil in the Haynesville Formation underlying the onshore Gulf of America and adjoining state waters.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 1,
    name: "USGS News Releases",
    url: "https://www.usgs.gov/news/news-releases",
  },
};
