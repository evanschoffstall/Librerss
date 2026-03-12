import type { Article, FeedSource } from "./types";

import { normalizeFeedUrl, tryNormalizeFeedUrl } from "@/lib/utils/url";

export const PLACEHOLDER_CATEGORY = "Placeholder Feeds";

export const PLACEHOLDER_FEED_SOURCES: FeedSource[] = [
  {
    category: PLACEHOLDER_CATEGORY,
    id: 1,
    name: "Live Science",
    url: "https://www.livescience.com/feeds/all",
  },
  {
    category: PLACEHOLDER_CATEGORY,
    id: 2,
    name: "Psychology Today",
    url: "https://www.psychologytoday.com/us/news",
  },
  {
    category: PLACEHOLDER_CATEGORY,
    id: 3,
    name: "NASA",
    url: "https://www.nasa.gov/rss/dyn/breaking_news.rss",
  },
];

interface PlaceholderSeed {
  content: string;
  slug: string;
  title: string;
  url: string;
}
type PlaceholderSeedTuple = readonly [
  title: string,
  slug: string,
  url: string,
  content: string,
];

const createPlaceholderSeeds = (
  entries: readonly PlaceholderSeedTuple[],
): PlaceholderSeed[] =>
  entries.map(([title, slug, url, content]) => ({
    content,
    slug,
    title,
    url,
  }));

const createPlaceholderArticles = (
  feedId: number,
  _basePath: string,
  seeds: PlaceholderSeed[],
): Article[] => {
  const MINUTE = 60 * 1000;
  return seeds.map((seed, index) => ({
    content: seed.content,
    feedId,
    id: -(feedId * 100 + index + 1),
    lastChecked: new Date(Date.now() - (4 + index) * MINUTE),
    link: seed.url,
    publicationDate: new Date(Date.now() - (12 + index * 23) * MINUTE),
    title: seed.title,
  }));
};

const toLocalPlaceholderPath = (basePath: string, slug: string) =>
  `/placeholder-articles/${basePath}/${slug}.html`;

const buildPlaceholderSnapshotPathByUrl = (
  basePath: string,
  seeds: PlaceholderSeed[],
): Record<string, string> =>
  Object.fromEntries(
    seeds.map((seed) => [
      tryNormalizeFeedUrl(seed.url),
      toLocalPlaceholderPath(basePath, seed.slug),
    ]),
  );

const WORLD_SEEDS = createPlaceholderSeeds([
  [
    "Humans and Neanderthals interbred — but it was mostly male Neanderthals and female humans, study finds",
    "neanderthals-interbred",
    "https://www.livescience.com/archaeology/neanderthals/humans-and-neanderthals-interbred-but-it-was-mostly-male-neanderthals-and-female-humans-who-coupled-up-study-finds",
    "Humans and Neanderthals interbred — but it was mostly male Neanderthals and female humans, study finds.",
  ],
  [
    "'Revolutionary': Vera C. Rubin Observatory found 800,000 objects of interest in a single night",
    "rubin-observatory-800k",
    "https://www.livescience.com/space/astronomy/rubin-observatory-alerts-scientists-to-800-000-new-asteroids-exploding-stars-and-other-cosmic-phenomena-in-just-one-night",
    "A sample of five solar systems objects that changed in brightness or position during Rubin's nightly observations.",
  ],
  [
    "Giant 'spiderwebs' on Mars contain tiny egg-like structures that scientists can't quite explain",
    "mars-spiderwebs",
    "https://www.livescience.com/space/mars/giant-spiderwebs-on-mars-contain-tiny-egg-like-structures-that-scientists-cant-quite-explain-nasa-rover-reveals",
    "One of the new photos, captured on Sept. 26, 2025, shows hundreds of tiny egg-like nodules on the surface of one of the boxwork ridges.",
  ],
  [
    "Fresh look at Apollo moon rocks solves decades-old mystery about the moon's magnetic field",
    "apollo-moon-rocks-magnetic-field",
    "https://www.livescience.com/space/the-moon/fresh-look-at-apollo-moon-rocks-solves-decades-old-mystery-about-the-moons-magnetic-field",
    "An Apollo 12 astronaut collects lunar samples while his fellow crew member takes a photo.",
  ],
  [
    "Chinese astronauts describe moment a crack was discovered on Shenzhou-20 spacecraft",
    "shenzhou-20-crack",
    "https://www.livescience.com/space/space-exploration/chinese-astronauts-describe-moment-a-crack-was-discovered-on-shenzhou-20-spacecraft",
    "Chinese astronauts describe moment a crack was discovered on Shenzhou-20 spacecraft.",
  ],
  [
    "Scientists find ancient black hole breaking the cosmic 'speed limit,' challenging multiple theories",
    "cosmic-speed-limit-black-hole",
    "https://www.livescience.com/space/black-holes/rule-breaking-black-hole-found-growing-at-13-times-the-cosmic-speed-limit-challenging-theories",
    "An artist's rendition of a black hole, along with its swirling accretion disk, bright corona and jet.",
  ],
]);

const TECHNOLOGY_SEEDS = createPlaceholderSeeds([
  [
    "The Most Dangerous Books in Society",
    "most-dangerous-books",
    "https://www.psychologytoday.com/us/blog/curious/202602/the-most-dangerous-books-in-society",
    "We talk about a lot of strange things in my Psychology 417: Science of Well-Being class.",
  ],
  [
    "For the Love of Boredom",
    "for-the-love-of-boredom",
    "https://www.psychologytoday.com/us/blog/modern-boredom/202602/for-the-love-of-boredom",
    "Everybody knows the story of Phineas Gage, the railroad worker who survived an iron bar shooting through his skull.",
  ],
  [
    "2 Ways to Stop Shutting Down During Conflicts",
    "stop-shutting-down-during-conflicts",
    "https://www.psychologytoday.com/us/blog/social-instincts/202602/2-ways-to-stop-shutting-down-during-conflicts",
    "Shutting down during conflict is often misunderstood as weakness, but it is usually a stress response.",
  ],
  [
    "How Kindness and Compassion Make Hard Goals Doable",
    "kindness-compassion-hard-goals",
    "https://www.psychologytoday.com/us/blog/from-striving-to-thriving/202602/how-kindness-and-compassion-make-hard-goals-doable",
    "A coaching challenge to do 100 push-ups in eight weeks became a lesson in motivation and support.",
  ],
  [
    "Perfectionists Don't Ever Believe You're Trying Your Best",
    "perfectionists-trying-your-best",
    "https://www.psychologytoday.com/us/blog/perfectionism/202602/perfectionists-dont-ever-believe-youre-trying-your-best",
    "Some people believe others are trying their best, while others insist you should always try your best.",
  ],
  [
    "Why Trying Too Hard Keeps You Stuck: The Art of Letting Go",
    "trying-too-hard-letting-go",
    "https://www.psychologytoday.com/us/blog/buddhist-psychology-east-meets-west/202602/why-trying-too-hard-keeps-you-stuck-the-art-of",
    "Many of us struggle to let go of relationship pain or career disappointments, and that struggle can linger for years.",
  ],
]);

const SCIENCE_SEEDS = createPlaceholderSeeds([
  [
    "JPL 3D-Printed Part Springs Forward",
    "jpl-3d-printed-part",
    "https://science.nasa.gov/photojournal/jpl-3d-printed-part-springs-forward/",
    "With a simple motion, a jack-in-the-box-like spring designed at NASA’s Jet Propulsion Laboratory showed the potential of additive manufacturing, also known as 3D printing, to cut costs and complexity for futuristic space antennas.",
  ],
  [
    "Landsat 9: More Than Just A Picture",
    "landsat-9-more-than-just-a-picture",
    "https://science.nasa.gov/missions/landsat/landsat-9-more-than-just-a-picture/",
    "For over 50 years, the Landsat program has provided the longest continuous satellite record of Earth's land surface from space.",
  ],
  [
    "NASA's ESCAPADE Ready to Study Space Weather from Earth to Mars",
    "escapade-space-weather-earth-mars",
    "https://science.nasa.gov/science-research/heliophysics/nasas-escapade-ready-to-study-space-weather-from-earth-to-mars/",
    "Once warm and watery, Mars is now cold and dry beneath a thin atmosphere.",
  ],
  [
    "Inside Project Hail Mary",
    "inside-project-hail-mary",
    "https://www.nasa.gov/image-article/inside-project-hail-mary/",
    "NASA astronaut Kjell Lindgren joined the Project Hail Mary event at JPL with cast and filmmakers to discuss human spaceflight.",
  ],
  [
    "NASA Invites Media to Discuss Next Steps for Artemis Campaign",
    "artemis-next-steps",
    "https://www.nasa.gov/news-release/nasa-invites-media-to-discuss-next-steps-for-artemis-campaign/",
    "After rollback of the Artemis II SLS rocket and Orion spacecraft, NASA scheduled a media briefing from Kennedy Space Center.",
  ],
  [
    "Dry-Season Floods Drench Northern Colombia",
    "dry-season-floods-colombia",
    "https://science.nasa.gov/earth/earth-observatory/dry-season-floods-drench-northern-colombia/",
    "Villages and farmland were swamped after unusually heavy early-February rains pushed the Sinú River over its banks.",
  ],
]);

const PLACEHOLDER_SNAPSHOT_PATH_BY_URL = {
  ...buildPlaceholderSnapshotPathByUrl("livescience", WORLD_SEEDS),
  ...buildPlaceholderSnapshotPathByUrl("psychologytoday", TECHNOLOGY_SEEDS),
  ...buildPlaceholderSnapshotPathByUrl("nasa", SCIENCE_SEEDS),
};

const PLACEHOLDER_ARTICLES_BY_SOURCE: Record<string, Article[]> = {
  [normalizeFeedUrl(PLACEHOLDER_FEED_SOURCES[0].url)]:
    createPlaceholderArticles(1, "livescience", WORLD_SEEDS),
  [normalizeFeedUrl(PLACEHOLDER_FEED_SOURCES[1].url)]:
    createPlaceholderArticles(2, "psychologytoday", TECHNOLOGY_SEEDS),
  [normalizeFeedUrl(PLACEHOLDER_FEED_SOURCES[2].url)]:
    createPlaceholderArticles(3, "nasa", SCIENCE_SEEDS),
};

export const getPlaceholderArticlesForSource = (url: string): Article[] =>
  PLACEHOLDER_ARTICLES_BY_SOURCE[tryNormalizeFeedUrl(url)] ?? [];

export const getPlaceholderSnapshotPathByArticleUrl = (
  url: string,
): null | string => {
  const normalizedUrl = tryNormalizeFeedUrl(url);
  return PLACEHOLDER_SNAPSHOT_PATH_BY_URL[normalizedUrl] ?? null;
};
