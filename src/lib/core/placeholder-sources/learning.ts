import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** NASA STEM and learning placeholders collected from public education feeds. */
export const NASA_LEARNING_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "nasa-learning",
  seeds: createPlaceholderSeeds([
    [
      "Artemis Moon Tree Dedicated in Honor of Mary W. Jackson",
      "artemis-moon-tree-dedicated-in-honor-of-mary-w-jackson",
      "https://science.nasa.gov/learning-resources/science-activation/artemis-moon-tree-dedicated-in-honor-of-mary-w-jackson/",
      "Students and staff at Mary W. Jackson Elementary School gathered with NASA Langley team members to dedicate an Artemis Moon Tree.",
    ],
    [
      "3 Ways Students Can Get Involved With Artemis",
      "3-ways-students-can-get-involved-with-artemis",
      "https://www.nasa.gov/learning-resources/3-ways-students-can-get-involved-with-artemis/",
      "NASA outlines several ways students can participate in the Artemis era through learning opportunities, challenges, and community science.",
    ],
    [
      "Science Through Shadows: How Astronomical Alignments Reveal the Universe",
      "science-through-shadows-how-astronomical-alignments-reveal-the-universe",
      "https://science.nasa.gov/learning-resources/science-activation/science-through-shadows-how-astronomical-alignments-reveal-the-universe/",
      "NASA explains how eclipses, occultations, and transits let scientists learn about planets, stars, and distant atmospheres.",
    ],
    [
      "NASA Glenn Opens Applications for Free Summer Engineering Institute",
      "nasa-glenn-hosts-engineering-institute",
      "https://www.nasa.gov/news-release/nasa-glenn-hosts-engineering-institute/",
      "NASA Glenn is inviting high school students to a hands-on summer engineering institute focused on future aerospace careers.",
    ],
    [
      "What Is Pi? (Grades 5-8)",
      "what-is-pi-grades-5-8",
      "https://www.nasa.gov/learning-resources/what-is-pi-grades-5-8/",
      "This classroom-friendly explainer introduces middle-school students to pi, why it matters, and why the number never ends.",
    ],
    [
      "NASA Astronauts to Answer Questions from Students in New York",
      "nasa-astronauts-to-answer-questions-from-students-in-new-york-3",
      "https://www.nasa.gov/news-release/nasa-astronauts-to-answer-questions-from-students-in-new-york-3/",
      "Students in New York will hear from astronauts aboard the International Space Station during a STEM-focused question-and-answer session.",
    ],
    [
      "ARMD Research Solicitations (Updated March 6)",
      "armd-solicitations",
      "https://www.nasa.gov/aeronautics/armd-solicitations/",
      "NASA's Aeronautics Research Mission Directorate maintains a current roundup of solicitations for researchers, collaborators, and innovators.",
    ],
    [
      "Astronomy Activation Ambassadors: Embracing Multiple Perspectives",
      "astronomy-activation-ambassadors-embracing-multiple-perspectives",
      "https://science.nasa.gov/learning-resources/science-activation/astronomy-activation-ambassadors-embracing-multiple-perspectives/",
      "NASA's Astronomy Activation Ambassadors project highlights classroom strategies that widen engagement with astronomy and STEM.",
    ],
    [
      "Career Spotlight: Welder (Ages 14-18)",
      "career-spotlight-welder-ages-14-18",
      "https://www.nasa.gov/learning-resources/career-spotlight-welder-ages-14-18/",
      "This student career profile explains how welders support aerospace manufacturing and why precise fabrication matters to spaceflight.",
    ],
    [
      "NASA Astronaut to Answer Questions from Students in Pennsylvania",
      "nasa-astronaut-to-answer-questions-from-students-in-pennsylvania",
      "https://www.nasa.gov/news-release/nasa-astronaut-to-answer-questions-from-students-in-pennsylvania/",
      "NASA astronaut Chris Williams will answer prerecorded STEM questions from Pennsylvania students while aboard the space station.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 11,
    name: "NASA STEM Learning",
    url: "https://www.nasa.gov/rss/dyn/educationnews.rss",
  },
};
