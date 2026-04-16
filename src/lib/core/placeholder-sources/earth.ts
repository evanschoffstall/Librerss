import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** ESA Earth-observation placeholders collected from public programme pages. */
export const ESA_EARTH_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "esa-earth",
  seeds: createPlaceholderSeeds([
    [
      "Earth from Space: Eyes on our Moon",
      "Earth_from_Space_Eyes_on_our_Moon",
      "https://www.esa.int/ESA_Multimedia/Images/2026/04/Earth_from_Space_Eyes_on_our_Moon",
      "Copernicus Sentinel-2 captures an unusual view of Earth's only natural satellite from an Earth-observing mission.",
    ],
    [
      "Sahara whips up a dust storm over Canary islands",
      "Sahara_whips_up_a_dust_storm_over_Canary_islands",
      "https://www.esa.int/ESA_Multimedia/Images/2026/04/Sahara_whips_up_a_dust_storm_over_Canary_islands",
      "Copernicus Sentinel-3 shows a Saharan dust storm moving over the Atlantic with the Canary Islands off Morocco's coast.",
    ],
    [
      "Eight more satellites added to IRIDE space programme",
      "Eight_more_satellites_added_to_IRIDE_space_programme",
      "https://www.esa.int/Applications/Observing_the_Earth/IRIDE/Eight_more_satellites_added_to_IRIDE_space_programme",
      "Eight more satellites have been added to Italy's IRIDE Earth-observation programme after a successful Falcon 9 launch.",
    ],
    [
      "Getting to the core of a medicane",
      "Getting_to_the_core_of_a_medicane",
      "https://www.esa.int/Applications/Observing_the_Earth/FutureEO/Getting_to_the_core_of_a_medicane",
      "ESA-backed research used rare Mediterranean cyclone observations to better understand the structure of a medicane over Libya.",
    ],
    [
      "Next MTG satellite passes final environmental tests",
      "Next_MTG_satellite_passes_final_environmental_tests",
      "https://www.esa.int/Applications/Observing_the_Earth/Meteorological_missions/meteosat_third_generation/Next_MTG_satellite_passes_final_environmental_tests",
      "The next Meteosat Third Generation satellite completed the environmental testing needed before launch.",
    ],
    [
      "Amazon wildfire emissions up to three times higher than estimated",
      "Amazon_wildfire_emissions_up_to_three_times_higher_than_estimated",
      "https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-5P/Amazon_wildfire_emissions_up_to_three_times_higher_than_estimated",
      "ESA-funded research suggests 2024 Amazon wildfire emissions may have been up to three times higher than early estimates.",
    ],
    [
      "Tracking Arctic freshwater flow from space",
      "Tracking_Arctic_freshwater_flow_from_space",
      "https://www.esa.int/Applications/Observing_the_Earth/FutureEO/Tracking_Arctic_freshwater_flow_from_space",
      "ESA researchers are using space data to understand how Arctic freshwater changes affect sea ice and ocean circulation.",
    ],
    [
      "Earth from Space: Maritime highways in the Oresund Strait",
      "Earth_from_Space_Maritime_highways_in_the_OEresund_Strait",
      "https://www.esa.int/ESA_Multimedia/Images/2026/03/Earth_from_Space_Maritime_highways_in_the_OEresund_Strait",
      "Copernicus Sentinel-1 imagery highlights the dense maritime traffic crossing the Oresund Strait.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 13,
    name: "ESA Earth Observation",
    url: "https://www.esa.int/rssfeed/Applications/Observing_the_Earth",
  },
};
