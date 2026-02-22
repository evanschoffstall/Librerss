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

const WORLD_SEEDS: PlaceholderSeed[] = [
  {
    title: "Regional power grid trial reduces outage recovery time by 22%",
    slug: "grid-trial-recovery-time",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "Port city expands flood barrier network before monsoon season",
    slug: "port-city-flood-barriers",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Cross-border rail timetable agreement adds overnight freight capacity",
    slug: "rail-overnight-freight-capacity",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Public health agency launches early-warning dashboard for heat risk",
    slug: "heat-risk-early-warning-dashboard",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Municipal housing retrofit program records first winter efficiency gains",
    slug: "housing-retrofit-efficiency-gains",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "Coastal airport tests autonomous tug routing for ground operations",
    slug: "airport-autonomous-tug-routing",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Agriculture ministry opens drought insurance data API for cooperatives",
    slug: "drought-insurance-data-api",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "Metropolitan bike network adds protected links near transit hubs",
    slug: "bike-network-transit-links",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "National archive digitization project reaches 10 million records indexed",
    slug: "archive-digitization-indexed-records",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "Intercity water-sharing pact adds transparent reservoir reporting",
    slug: "water-sharing-reservoir-reporting",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
];

const TECHNOLOGY_SEEDS: PlaceholderSeed[] = [
  {
    title: "Edge inference toolkit adds quantization presets for ARM gateways",
    slug: "edge-inference-quantization-presets",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "Open telemetry client introduces schema migration assistant",
    slug: "telemetry-schema-migration-assistant",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Passwordless auth provider ships hardware-backed passkey recovery flow",
    slug: "passkey-recovery-hardware-backed",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Database proxy benchmark shows better tail latency after queue tuning",
    slug: "database-proxy-tail-latency",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "Design system compiler adds token diff snapshots in pull requests",
    slug: "design-system-token-diff-snapshots",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "Container runtime patch cuts cold-start variance for short jobs",
    slug: "container-runtime-cold-start-variance",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "Mobile crash analytics SDK adds offline symbolication queue",
    slug: "mobile-crash-sdk-offline-symbolication",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Graph query engine preview introduces cost hints for nested filters",
    slug: "graph-query-cost-hints",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Developer platform bundles local secret vault for ephemeral environments",
    slug: "developer-platform-local-secret-vault",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "A11y lint rule pack expands checks for keyboard trap edge cases",
    slug: "a11y-lint-keyboard-trap-checks",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
];

const SCIENCE_SEEDS: PlaceholderSeed[] = [
  {
    title: "Ocean sensor array identifies seasonal plankton bloom timing shift",
    slug: "plankton-bloom-timing-shift",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Low-cost air monitors validate wildfire smoke model in rural counties",
    slug: "air-monitor-wildfire-model-validation",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Clinical trial consortium publishes open protocol for adaptive enrollment",
    slug: "adaptive-enrollment-open-protocol",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Lab demonstrates recyclable membrane for industrial desalination pilot",
    slug: "recyclable-membrane-desalination",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Seismic team maps microfault activity beneath rapidly growing suburbs",
    slug: "microfault-activity-suburbs",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Bioinformatics workflow cuts genome assembly runtime on shared clusters",
    slug: "genome-assembly-runtime-cut",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Archaeology project reconstructs trade routes from isotopic pottery scans",
    slug: "isotopic-pottery-trade-routes",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Urban ecology study links tree diversity to lower summer street temperatures",
    slug: "tree-diversity-street-temperature",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title: "Particle detector upgrade improves rare-event background rejection",
    slug: "particle-detector-background-rejection",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
  {
    title:
      "Citizen science network tracks pollinator recovery across restored meadows",
    slug: "pollinator-recovery-restored-meadows",
    content:
      "This placeholder article provides an extended body for realistic UI testing, including list previews, expanded reading views, search snippets, and typography checks across desktop and mobile layouts. The narrative explains timeline context, implementation milestones, operational dependencies, and review checkpoints so the entry behaves like a substantial report instead of a short stub. Additional lines describe stakeholder coordination, risk tracking, data verification, and follow up planning, which helps validate truncation behavior, line wrapping, spacing rhythm, and scroll performance under heavier content loads. The text remains intentionally synthetic and neutral so teams can test interaction quality, loading behavior, and long form readability without relying on sensitive or production editorial material.",
  },
];

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
