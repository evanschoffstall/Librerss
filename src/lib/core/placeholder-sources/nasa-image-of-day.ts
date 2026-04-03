import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** NASA image-detail placeholders collected from the public Image of the Day feed. */
export const NASA_IMAGE_OF_DAY_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "nasa-image-of-day",
  seeds: createPlaceholderSeeds([
    [
      "Hello, World",
      "fd02_for-pao",
      "https://www.nasa.gov/image-detail/fd02_for-pao/",
      "NASA astronaut Reid Wiseman photographed Earth through Orion's window after translunar injection during Artemis II.",
    ],
    [
      "Artemis II Astronauts Launch to Moon",
      "artemis-ii-launch-17",
      "https://www.nasa.gov/image-detail/artemis-ii-launch-17/",
      "This launch image shows Orion and the Artemis II crew departing Earth atop NASA's Space Launch System.",
    ],
    [
      "Godspeed, Artemis II!",
      "her1pqpbeaazfzl",
      "https://www.nasa.gov/image-detail/her1pqpbeaazfzl/",
      "A floating Artemis program patch inside the International Space Station offered a visual sendoff to the Artemis II mission.",
    ],
    [
      "Sendoff for Artemis II Crew",
      "jsc2026e017251",
      "https://www.nasa.gov/image-detail/jsc2026e017251/",
      "NASA and CSA astronauts gathered for a prelaunch crew portrait ahead of the Artemis II mission.",
    ],
    [
      "Artemis II Crew's Suits",
      "artemis-ii-preflight-5",
      "https://www.nasa.gov/image-detail/artemis-ii-preflight-5/",
      "The Orion Crew Survival System suits for Artemis II are shown during final launch preparations.",
    ],
    [
      "NASA's IXPE Gets Fresh Look at Supernova",
      "rcw86-xray-ixpe-optical-f2bd3a",
      "https://www.nasa.gov/image-detail/rcw86-xray-ixpe-optical-f2bd3a/",
      "IXPE, Chandra, and XMM-Newton observations combine to reveal the outer rim of a supernova remnant in multiple wavelengths.",
    ],
    [
      "Webb Captures Saturn in Infrared",
      "full-res-for-display-2-2",
      "https://www.nasa.gov/image-detail/full-res-for-display-2-2/",
      "A Webb infrared view of Saturn highlights the planet's rings, atmosphere, and several icy moons.",
    ],
    [
      "Reminders of Where We've Been, Where We're Going",
      "nasa-update-on-implementation-of-national-space-policy",
      "https://www.nasa.gov/image-detail/nasa-update-on-implementation-of-national-space-policy/",
      "Moon rocks on display underscore NASA's planning for a sustained return to the lunar surface.",
    ],
    [
      "NASA's Hubble, Webb Telescopes Survey Pinwheel Galaxy",
      "55150964901-45196b40b6-o",
      "https://www.nasa.gov/image-detail/55150964901-45196b40b6-o/",
      "A combined Hubble and Webb image offers a closer look at the luminous core of the Pinwheel Galaxy.",
    ],
    [
      "Smiles and Spacesuits",
      "iss074e0009033",
      "https://www.nasa.gov/image-detail/iss074e0009033/",
      "Expedition 74 astronaut Chris Williams smiles during a spacesuit fit verification aboard the International Space Station.",
    ],
    [
      "American Bald Eagle at NASA's Kennedy Space Center",
      "afs-8-101-1245",
      "https://www.nasa.gov/image-detail/afs-8-101-1245/",
      "An American bald eagle lifts off near its nest at NASA's Kennedy Space Center in Florida.",
    ],
    [
      "Lava Flows Down Mayon",
      "mayonvolcano-oli-20260226-lrg",
      "https://www.nasa.gov/image-detail/mayonvolcano-oli-20260226-lrg/",
      "Satellite imagery captures active lava flows descending Mayon Volcano during an early-2026 eruption.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 10,
    name: "NASA Image of the Day",
    url: "https://www.nasa.gov/rss/dyn/lg_image_of_the_day.rss",
  },
};