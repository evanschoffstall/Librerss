import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** NASA breaking-news placeholders collected from public, scrape-friendly feeds. */
export const NASA_BREAKING_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "nasa-breaking",
  seeds: createPlaceholderSeeds([
    [
      'Virgil I. "Gus" Grissom',
      "virgil-i-gus-grissom",
      "https://www.nasa.gov/image-article/virgil-i-gus-grissom/",
      'Today marks the 100th anniversary of the birth of Virgil I. "Gus" Grissom, one of NASA\'s original Mercury astronauts and the second American to fly in space.',
    ],
    [
      "Hello, World",
      "hello-world",
      "https://www.nasa.gov/image-article/hello-world/",
      "NASA astronaut Reid Wiseman photographed Earth from Orion's window after translunar injection, capturing auroras and the glow of zodiacal light.",
    ],
    [
      "Barents Sea Tied to Low Arctic Sea Ice",
      "barents-sea-tied-to-low-arctic-sea-ice",
      "https://science.nasa.gov/earth/earth-observatory/barents-sea-tied-to-low-arctic-sea-ice/",
      "Patches of open water in the Barents Sea contributed to Arctic sea ice extent tying the satellite-era minimum maximum observed for March 2026.",
    ],
    [
      "NASA's Artemis II Mission Leaves Earth Orbit for Flight around Moon",
      "nasas-artemis-ii-mission-leaves-earth-orbit-for-flight-around-moon",
      "https://www.nasa.gov/news-release/nasas-artemis-ii-mission-leaves-earth-orbit-for-flight-around-moon/",
      "NASA confirmed Orion completed a key engine burn, sending Artemis II beyond Earth orbit and on its crewed path around the Moon.",
    ],
    [
      "Artemis II Astronauts Launch to Moon",
      "artemis-ii-astronauts-launch-to-moon",
      "https://www.nasa.gov/image-article/artemis-ii-astronauts-launch-to-moon/",
      "An April 2026 image captures NASA's Space Launch System and Orion lifting the Artemis II crew toward the Moon.",
    ],
    [
      "Reunion Island Lava Reaches the Sea",
      "reunion-island-lava-reaches-the-sea",
      "https://science.nasa.gov/earth/earth-observatory/reunion-island-lava-reaches-the-sea/",
      "Satellite observations show a sustained 2026 eruption at Piton de la Fournaise with lava flows extending to the coastline.",
    ],
    [
      "Liftoff! NASA Launches Astronauts on Historic Artemis Moon Mission",
      "liftoff-nasa-launches-astronauts-on-historic-artemis-moon-mission",
      "https://www.nasa.gov/news-release/liftoff-nasa-launches-astronauts-on-historic-artemis-moon-mission/",
      "NASA's Artemis II crew launched aboard SLS and Orion for the first crewed lunar flyby mission in more than 50 years.",
    ],
    [
      "March of the Harmattan",
      "march-of-the-harmattan",
      "https://science.nasa.gov/earth/earth-observatory/march-of-the-harmattan/",
      "Strong March 2026 Harmattan winds carried Saharan dust over northwestern Africa and toward the Canary Islands.",
    ],
    [
      "Godspeed, Artemis II!",
      "godspeed-artemis-ii",
      "https://www.nasa.gov/image-article/godspeed-artemis-ii/",
      "NASA astronaut Jessica Meir shared a floating Artemis program patch from the International Space Station to wish the Artemis II crew well.",
    ],
    [
      "Landsat Reveals Reservoir Changes and Bathymetry",
      "landsat-reveals-reservoir-changes-and-bathymetry",
      "https://science.nasa.gov/missions/landsat/landsat-reveals-reservoir-changes-and-bathymetry/",
      "Two recent studies used Landsat observations to improve estimates of reservoir structure, shoreline change, and bathymetry.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 9,
    name: "NASA Breaking News",
    url: "https://www.nasa.gov/rss/dyn/breaking_news.rss",
  },
};
