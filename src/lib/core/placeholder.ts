import { normalizeFeedUrl, tryNormalizeFeedUrl } from "@/lib/utils/url";
import type { Article, FeedSource } from "./types";

export const PLACEHOLDER_CATEGORY = "Placeholder Feeds";

export const PLACEHOLDER_FEED_SOURCES: FeedSource[] = [
  {
    id: 1,
    name: "World News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: PLACEHOLDER_CATEGORY,
  },
  {
    id: 2,
    name: "Technology",
    url: "https://techcrunch.com/feed/",
    category: PLACEHOLDER_CATEGORY,
  },
  {
    id: 3,
    name: "Science",
    url: "https://feeds.feedburner.com/oreilly/radar",
    category: PLACEHOLDER_CATEGORY,
  },
];

type PlaceholderSeed = { title: string; slug: string; content: string };
type PlaceholderSeedTuple = readonly [title: string, slug: string];

const PLACEHOLDER_ARTICLE_CONTENT =
  "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.";

const createPlaceholderSeeds = (
  entries: readonly PlaceholderSeedTuple[],
): PlaceholderSeed[] =>
  entries.map(([title, slug]) => ({
    title,
    slug,
    content: PLACEHOLDER_ARTICLE_CONTENT,
  }));

const createPlaceholderArticles = (
  feedId: number,
  basePath: string,
  seeds: PlaceholderSeed[],
): Article[] => {
  const MINUTE = 60 * 1000;
  return seeds.map((seed, index) => ({
    id: -(feedId * 100 + index + 1),
    title: seed.title,
    link: `https://example.com/${basePath}/${seed.slug}`,
    content: seed.content,
    publicationDate: new Date(Date.now() - (12 + index * 23) * MINUTE),
    lastChecked: new Date(Date.now() - (4 + index) * MINUTE),
    feedId,
  }));
};

const WORLD_SEEDS = createPlaceholderSeeds([
  [
    "Regional power grid trial reduces outage recovery time by 22%",
    "grid-trial-recovery-time",
  ],
  [
    "Port city expands flood barrier network before monsoon season",
    "port-city-flood-barriers",
  ],
  [
    "Cross-border rail timetable agreement adds overnight freight capacity",
    "rail-overnight-freight-capacity",
  ],
  [
    "Public health agency launches early-warning dashboard for heat risk",
    "heat-risk-early-warning-dashboard",
  ],
  [
    "Municipal housing retrofit program records first winter efficiency gains",
    "housing-retrofit-efficiency-gains",
  ],
  [
    "Coastal airport tests autonomous tug routing for ground operations",
    "airport-autonomous-tug-routing",
  ],
  [
    "Agriculture ministry opens drought insurance data API for cooperatives",
    "drought-insurance-data-api",
  ],
  [
    "Metropolitan bike network adds protected links near transit hubs",
    "bike-network-transit-links",
  ],
  [
    "National archive digitization project reaches 10 million records indexed",
    "archive-digitization-indexed-records",
  ],
  [
    "Intercity water-sharing pact adds transparent reservoir reporting",
    "water-sharing-reservoir-reporting",
  ],
]);

const TECHNOLOGY_SEEDS = createPlaceholderSeeds([
  [
    "Edge inference toolkit adds quantization presets for ARM gateways",
    "edge-inference-quantization-presets",
  ],
  [
    "Open telemetry client introduces schema migration assistant",
    "telemetry-schema-migration-assistant",
  ],
  [
    "Passwordless auth provider ships hardware-backed passkey recovery flow",
    "passkey-recovery-hardware-backed",
  ],
  [
    "Database proxy benchmark shows better tail latency after queue tuning",
    "database-proxy-tail-latency",
  ],
  [
    "Design system compiler adds token diff snapshots in pull requests",
    "design-system-token-diff-snapshots",
  ],
  [
    "Container runtime patch cuts cold-start variance for short jobs",
    "container-runtime-cold-start-variance",
  ],
  [
    "Mobile crash analytics SDK adds offline symbolication queue",
    "mobile-crash-sdk-offline-symbolication",
  ],
  [
    "Graph query engine preview introduces cost hints for nested filters",
    "graph-query-cost-hints",
  ],
  [
    "Developer platform bundles local secret vault for ephemeral environments",
    "developer-platform-local-secret-vault",
  ],
  [
    "A11y lint rule pack expands checks for keyboard trap edge cases",
    "a11y-lint-keyboard-trap-checks",
  ],
]);

const SCIENCE_SEEDS = createPlaceholderSeeds([
  [
    "Ocean sensor array identifies seasonal plankton bloom timing shift",
    "plankton-bloom-timing-shift",
  ],
  [
    "Low-cost air monitors validate wildfire smoke model in rural counties",
    "air-monitor-wildfire-model-validation",
  ],
  [
    "Clinical trial consortium publishes open protocol for adaptive enrollment",
    "adaptive-enrollment-open-protocol",
  ],
  [
    "Lab demonstrates recyclable membrane for industrial desalination pilot",
    "recyclable-membrane-desalination",
  ],
  [
    "Seismic team maps microfault activity beneath rapidly growing suburbs",
    "microfault-activity-suburbs",
  ],
  [
    "Bioinformatics workflow cuts genome assembly runtime on shared clusters",
    "genome-assembly-runtime-cut",
  ],
  [
    "Archaeology project reconstructs trade routes from isotopic pottery scans",
    "isotopic-pottery-trade-routes",
  ],
  [
    "Urban ecology study links tree diversity to lower summer street temperatures",
    "tree-diversity-street-temperature",
  ],
  [
    "Particle detector upgrade improves rare-event background rejection",
    "particle-detector-background-rejection",
  ],
  [
    "Citizen science network tracks pollinator recovery across restored meadows",
    "pollinator-recovery-restored-meadows",
  ],
]);

const PLACEHOLDER_ARTICLES_BY_SOURCE: Record<string, Article[]> = {
  [normalizeFeedUrl(PLACEHOLDER_FEED_SOURCES[0].url)]:
    createPlaceholderArticles(1, "world", WORLD_SEEDS),
  [normalizeFeedUrl(PLACEHOLDER_FEED_SOURCES[1].url)]:
    createPlaceholderArticles(2, "technology", TECHNOLOGY_SEEDS),
  [normalizeFeedUrl(PLACEHOLDER_FEED_SOURCES[2].url)]:
    createPlaceholderArticles(3, "science", SCIENCE_SEEDS),
};

export const getPlaceholderArticlesForSource = (url: string): Article[] =>
  PLACEHOLDER_ARTICLES_BY_SOURCE[tryNormalizeFeedUrl(url)] ?? [];
