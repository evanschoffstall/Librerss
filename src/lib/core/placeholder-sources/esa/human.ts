import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-shared";
import { PLACEHOLDER_CATEGORY } from "@/lib/core/placeholder-shared";

/** ESA human-spaceflight placeholders collected from public exploration pages. */
export const ESA_HUMAN_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "esa-human",
  seeds: createPlaceholderSeeds([
    [
      "Artemis II: Journey to the Moon begins",
      "Artemis_II_Journey_to_the_Moon_begins",
      "https://www.esa.int/ESA_Multimedia/Videos/2026/04/Artemis_II_Journey_to_the_Moon_begins",
      "Artemis II launched with ESA's European Service Module at the heart of the first crewed lunar mission in over 50 years.",
    ],
    [
      "Artemis II mission begins",
      "Artemis_II_mission_begins",
      "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Artemis_II_mission_begins",
      "NASA's Space Launch System lifted four astronauts toward the Moon on Artemis II, powered in part by ESA's European Service Module.",
    ],
    [
      "Watch live: Artemis II launch",
      "Watch_live_Artemis_II_launch",
      "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Watch_live_Artemis_II_launch",
      "ESA invited viewers to follow the first launch opportunity for Artemis II, the first astronaut mission toward the Moon in decades.",
    ],
    [
      "Artemis II: let's go",
      "Artemis_II_let_s_go",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Artemis_II_let_s_go",
      "An image from Kennedy Space Center shows the Artemis II rocket standing on the launch pad before departure.",
    ],
    [
      "European eyes on Artemis",
      "European_eyes_on_Artemis",
      "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/European_eyes_on_Artemis",
      "Europe travels with Artemis II through the European Service Module and a growing human-spaceflight role in lunar exploration.",
    ],
    [
      "European Service Module engines powering Artemis II",
      "European_Service_Module_engines_powering_Artemis_II",
      "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/European_Service_Module_engines_powering_Artemis_II",
      "ESA explains how the European Service Module will provide propulsion, power, and life support on Artemis II.",
    ],
    [
      "ESA's astronaut reserve begins final training block",
      "ESA_s_astronaut_reserve_begins_final_training_block",
      "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/ESA_s_astronaut_reserve_begins_final_training_block",
      "Members of ESA's astronaut reserve returned to Cologne for the final training block of the Astronaut Reserve Training programme.",
    ],
    [
      "How Europe will power the journey to the Moon and back",
      "How_Europe_will_power_the_journey_to_the_Moon_and_back",
      "https://www.esa.int/ESA_Multimedia/Videos/2026/03/How_Europe_will_power_the_journey_to_the_Moon_and_back",
      "ESA outlines how Europe's hardware and engineering support the Artemis II journey to the Moon and home again.",
    ],
    [
      "We're going to the Moon | Artemis II ESAxASH",
      "We_re_going_to_the_Moon_Artemis_II_ESAxASH",
      "https://www.esa.int/ESA_Multimedia/Videos/2026/03/We_re_going_to_the_Moon_Artemis_II_ESAxASH",
      "A short ESAxASH video highlights Europe's role in returning humans to the Moon through Artemis II.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 14,
    name: "ESA Human Exploration",
    url: "https://www.esa.int/rssfeed/Science_Exploration/Human_and_Robotic_Exploration",
  },
};
