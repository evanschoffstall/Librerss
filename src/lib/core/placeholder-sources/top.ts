import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** ESA top-news placeholders used to round out the broader preview catalog. */
export const ESA_TOP_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "esa-top",
  seeds: createPlaceholderSeeds([
    [
      "epsilon",
      "epsilon",
      "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/epsilon",
      "ESA highlights epsilon as part of its current human and robotic exploration coverage.",
    ],
    [
      "Week in images: 30 March - 03 April 2026",
      "Week_in_images_30_March_-_03_April_2026",
      "https://www.esa.int/About_Us/Week_in_images/Week_in_images_30_March_-_03_April_2026",
      "ESA's weekly image roundup collects the most notable mission and astronomy visuals from the week.",
    ],
    [
      "A pair of planet-forming discs",
      "A_pair_of_planet-forming_discs",
      "https://www.esa.int/ESA_Multimedia/Images/2026/04/A_pair_of_planet-forming_discs",
      "ESA shared a new image of a pair of planet-forming discs observed around young stars.",
    ],
    [
      "Five things Juice has revealed about Comet 3I/ATLAS",
      "Five_things_Juice_has_revealed_about_Comet_3I_ATLAS",
      "https://www.esa.int/Science_Exploration/Space_Science/Juice/Five_things_Juice_has_revealed_about_Comet_3I_ATLAS",
      "ESA's Juice mission offers five scientific takeaways from its observations of Comet 3I/ATLAS.",
    ],
    [
      "Geraldine Naja takes up duty as Director of Space Transportation",
      "Geraldine_Naja_takes_up_duty_as_Director_of_Space_Transportation",
      "https://www.esa.int/About_Us/Corporate_news/Geraldine_Naja_takes_up_duty_as_Director_of_Space_Transportation",
      "Geraldine Naja assumed leadership of ESA's Space Transportation directorate on 1 April 2026.",
    ],
    [
      "Christine Klein takes up duty as acting Director of Controlling, Finance and Operational Procurement",
      "Christine_Klein_takes_up_duty_as_acting_Director_of_Controlling_Finance_and_Operational_Procurement",
      "https://www.esa.int/About_Us/Corporate_news/Christine_Klein_takes_up_duty_as_acting_Director_of_Controlling_Finance_and_Operational_Procurement",
      "Christine Klein took up duty as acting Director of Controlling, Finance and Operational Procurement at ESA.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 15,
    name: "ESA Top News",
    url: "https://www.esa.int/rssfeed/TopNews",
  },
};
