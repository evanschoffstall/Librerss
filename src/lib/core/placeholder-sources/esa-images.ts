import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** ESA image feed placeholders collected from scrape-friendly public pages. */
export const ESA_IMAGES_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "esa-images",
  seeds: createPlaceholderSeeds([
    [
      "Liftoff for Celeste on Rocket Lab's Electron rocket",
      "Liftoff_for_Celeste_on_Rocket_Lab_s_Electron_rocket",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Liftoff_for_Celeste_on_Rocket_Lab_s_Electron_rocket",
      "Liftoff for Celeste on Rocket Lab's Electron rocket.",
    ],
    [
      "The ART of robotics training",
      "The_ART_of_robotics_training",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/The_ART_of_robotics_training",
      "Meganne Christian during VR robotics training.",
    ],
    [
      "Where spiral arms and star formation meet",
      "Where_spiral_arms_and_star_formation_meet",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Where_spiral_arms_and_star_formation_meet",
      "A Hubble image reveals the barred spiral galaxy IC 486 where spiral arms and active star formation intersect.",
    ],
    [
      "Earth from Space: Kimberley, Australia",
      "Earth_from_Space_Kimberley_Australia",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Earth_from_Space_Kimberley_Australia",
      "Western Australia's Kimberley region is featured in this double view from the Copernicus Sentinel-2 mission.",
    ],
    [
      "Saturn (2024 Webb and Hubble images)",
      "Saturn_2024_Webb_and_Hubble_images",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Saturn_2024_Webb_and_Hubble_images",
      "A combined Webb and Hubble perspective highlights Saturn's atmosphere and rings.",
    ],
    [
      "Carbon monoxide emission differences over central South America",
      "Carbon_monoxide_emission_differences_over_central_South_America",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Carbon_monoxide_emission_differences_over_central_South_America",
      "ESA imagery compares carbon monoxide emission patterns over central South America.",
    ],
    [
      "Hubble revisits Crab Nebula to track 25 years of expansion",
      "Hubble_revisits_Crab_Nebula_to_track_25_years_of_expansion",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Hubble_revisits_Crab_Nebula_to_track_25_years_of_expansion",
      "New Hubble observations help astronomers track 25 years of expansion in the Crab Nebula.",
    ],
    [
      "Mackenzie River",
      "Mackenzie_River",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Mackenzie_River",
      "ESA imagery highlights the Mackenzie River system from orbit.",
    ],
    [
      "Spectrum on the launch pad under Northern Lights",
      "Spectrum_on_the_launch_pad_under_Northern_Lights",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Spectrum_on_the_launch_pad_under_Northern_Lights",
      "The Spectrum rocket stands on its launch pad beneath the Northern Lights.",
    ],
    [
      "Artemis II rolls again",
      "Artemis_II_rolls_again",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Artemis_II_rolls_again",
      "The Artemis II rocket returns to the launch pad after a second rollout at Kennedy Space Center.",
    ],
    [
      "Earth from Space: Jostedalsbreen, Norway",
      "Earth_from_Space_Jostedalsbreen_Norway",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Earth_from_Space_Jostedalsbreen_Norway",
      "Copernicus Sentinel-2 captures western Norway and Jostedalsbreen, the largest glacier in continental Europe.",
    ],
    [
      "Proba-3's Coronagraph captured by the Occulter",
      "Proba-3_s_Coronagraph_captured_by_the_Occulter",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Proba-3_s_Coronagraph_captured_by_the_Occulter",
      "The Proba-3 mission captures its Coronagraph from the Occulter spacecraft.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 12,
    name: "ESA Images",
    url: "https://www.esa.int/rssfeed/ESA_Multimedia/Images",
  },
};