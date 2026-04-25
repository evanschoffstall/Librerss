import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** NOAA placeholder feed used in database-free preview mode. */
export const NOAA_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "noaa",
  seeds: createPlaceholderSeeds([
    [
      "NOAA deploys new generation of AI-driven global weather models",
      "noaa-deploys-new-generation-of-ai-driven-global-weather-models",
      "https://www.noaa.gov/news-release/noaa-deploys-new-generation-of-ai-driven-global-weather-models",
      "NOAA has launched a groundbreaking new suite of operational AI-driven global weather prediction models, marking a significant advancement in forecast speed, efficiency, and accuracy.",
    ],
    [
      "Explainer: Understanding hurricane hazards",
      "explainer-understanding-hurricane-hazards",
      "https://www.noaa.gov/explainers/explainer-understanding-hurricane-hazards",
      "NOAA explains the major hazards hurricanes bring, from storm surge and inland flooding to wind, tornadoes, and dangerous surf.",
    ],
    [
      "Celebrating seals and sea lions the week of March 11",
      "seal-sea-lion-week-ext",
      "https://www.fisheries.noaa.gov/feature-story/seal-and-sea-lion-week",
      "Join us for a week-long celebration of seals and other pinnipeds and get the scoop on NOAA's seal conservation efforts.",
    ],
    [
      "Colossal coral in the Mariana Islands is largest of its kind",
      "video-colossal-coral-found-in-mariana-islands-is-largest-of-its-kind-ext",
      "https://oceanservice.noaa.gov/news/mar26/colossal-coral-mariana-islands.html",
      "Researchers measure 14,500-square-foot coral structure in an underwater volcano.",
    ],
    [
      "Marsh Madness",
      "marsh-madness-ext",
      "https://www.fisheries.noaa.gov/feature-story/marsh-madness",
      "While players duel it out on the court, we're keeping score of all the ways marsh habitat plays an important role in the protection and restoration work we do for communities, fish, and wildlife.",
    ],
    [
      "Weird and Wonderful: 10 Years of Northeast Bottom Longline Survey Video Footage",
      "gallery-10-years-of-weird-wonderful-photos-from-fisheries-longline-survey-ext",
      "https://www.fisheries.noaa.gov/science-blog/weird-and-wonderful-10-years-northeast-bottom-longline-survey-video-footage",
      "Field scientist Hannah Ciarametaro explains how and why the Cooperative Research team collects video footage of the ocean floor during the Gulf of Maine Bottom Longline Survey.",
    ],
    [
      "On This Day: 2011 Tohoku Earthquake and Tsunami",
      "on-day-japans-deadly-2011-tohoku-earthquake-and-tsunami",
      "https://www.ncei.noaa.gov/news/day-2011-japan-earthquake-and-tsunami",
      "On March 11, 2011, a magnitude 9.1 earthquake struck off the northeast coast of Honshu, Japan, generating a deadly tsunami.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 2,
    name: "NOAA News and Features",
    url: "https://www.noaa.gov/news-and-features",
  },
};
