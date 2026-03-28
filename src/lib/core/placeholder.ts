import { normalizeFeedUrl, tryNormalizeFeedUrl } from "@/lib/utils/url";

import type { Article, FeedSource } from "./types";

export const PLACEHOLDER_CATEGORY = "Placeholder Feeds";

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

interface PlaceholderSourceDefinition {
  basePath: string;
  seeds: PlaceholderSeed[];
  source: FeedSource;
}

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

const PLACEHOLDER_SOURCE_DEFINITIONS: PlaceholderSourceDefinition[] = [
  {
    basePath: "usgs",
    seeds: createPlaceholderSeeds([
      [
        "Media Alert: Low-level airplane and helicopter flights to scan geology over southern, central New Mexico",
        "new-mexico-geology-scan",
        "https://www.usgs.gov/news/state-news-release/media-alert-low-level-airplane-and-helicopter-flights-scan-geology-over",
        "RESTON, Va. — The U.S. Geological Survey plans low-level flights by airplane and helicopter over southern and central New Mexico to image geology using airborne geophysical technology.",
      ],
      [
        "Value of U.S. mineral production rose last year, driven by precious metals prices",
        "mineral-production-rose",
        "https://www.usgs.gov/news/national-news-release/value-us-mineral-production-rose-last-year-driven-precious-metals-prices",
        "The USGS releases Mineral Commodity Summaries 2026, the first and most authoritative source for mineral production, trade and consumption data.",
      ],
      [
        "Low-level helicopter flights to image geology over Wyoming and Colorado",
        "wyoming-colorado-helicopter-survey",
        "https://www.usgs.gov/news/state-news-release/low-level-helicopter-flights-image-geology-over-wyoming-and-colorado-0",
        "RESTON, Va. — Low-level helicopter flights are planned over areas of Wyoming and northern Colorado to image geology using airborne geophysical technology for up to one month.",
      ],
      [
        "USGS releases assessment of undiscovered oil and gas resources in Woodford and Barnett shales",
        "woodford-barnett-assessment",
        "https://www.usgs.gov/news/national-news-release/usgs-releases-assessment-undiscovered-oil-and-gas-resources-woodford-and",
        "RESTON, Va. — The U.S. Geological Survey released its assessment of undiscovered gas and oil in the Woodford and Barnett shales in the Permian Basin.",
      ],
      [
        "Media Alert: Low-level flights to image geology and aquifers over parts of New Mexico and Texas",
        "new-mexico-texas-aquifers",
        "https://www.usgs.gov/news/state-news-release/media-alert-low-level-flights-image-geology-and-aquifers-over-parts-new",
        "RESTON, Va. — Low-level helicopter flights are planned over parts of eastern New Mexico and western Texas to image geology and aquifers using airborne geophysical technology.",
      ],
      [
        "USGS releases assessment of undiscovered gas resources in Gulf Coast’s Haynesville Formation",
        "haynesville-gas-assessment",
        "https://www.usgs.gov/news/national-news-release/usgs-releases-assessment-undiscovered-gas-resources-gulf-coasts",
        "RESTON, Va. — The U.S. Geological Survey released its assessment of potential for undiscovered gas and oil in the Haynesville Formation underlying the onshore Gulf of America and adjoining state waters.",
      ],
    ]),
    source: {
      category: PLACEHOLDER_CATEGORY,
      extractionDisabled: true,
      id: 1,
      name: "USGS News Releases",
      url: "https://www.usgs.gov/news/news-releases",
    },
  },
  {
    basePath: "noaa",
    seeds: createPlaceholderSeeds([
      [
        "NOAA deploys new generation of AI-driven global weather models",
        "noaa-deploys-new-generation-of-ai-driven-global-weather-models",
        "https://www.noaa.gov/news-release/noaa-deploys-new-generation-of-ai-driven-global-weather-models",
        "NOAA has launched a groundbreaking new suite of operational AI-driven global weather prediction models, marking a significant advancement in forecast speed, efficiency, and accuracy.",
      ],
      [
        "Explainer: Understanding hurricane hazards",
        "explainer-understanding-hurricane-hazards",
        "https://www.noaa.gov/explainers/explainer-understanding-hurricane-hazards",
        "NOAA explains the major hazards hurricanes bring, from storm surge and inland flooding to wind, tornadoes, and dangerous surf.",
      ],
      [
        "Celebrating seals and sea lions the week of March 11",
        "seal-sea-lion-week-ext",
        "https://www.fisheries.noaa.gov/feature-story/seal-and-sea-lion-week",
        "Join us for a week-long celebration of seals and other pinnipeds and get the scoop on NOAA's seal conservation efforts.",
      ],
      [
        "Colossal coral in the Mariana Islands is largest of its kind",
        "video-colossal-coral-found-in-mariana-islands-is-largest-of-its-kind-ext",
        "https://oceanservice.noaa.gov/news/mar26/colossal-coral-mariana-islands.html",
        "Researchers measure 14,500-square-foot coral structure in an underwater volcano.",
      ],
      [
        "Marsh Madness",
        "marsh-madness-ext",
        "https://www.fisheries.noaa.gov/feature-story/marsh-madness",
        "While players duel it out on the court, we're keeping score of all the ways marsh habitat plays an important role in the protection and restoration work we do for communities, fish, and wildlife.",
      ],
      [
        "Weird and Wonderful: 10 Years of Northeast Bottom Longline Survey Video Footage",
        "gallery-10-years-of-weird-wonderful-photos-from-fisheries-longline-survey-ext",
        "https://www.fisheries.noaa.gov/science-blog/weird-and-wonderful-10-years-northeast-bottom-longline-survey-video-footage",
        "Field scientist Hannah Ciarametaro explains how and why the Cooperative Research team collects video footage of the ocean floor during the Gulf of Maine Bottom Longline Survey.",
      ],
      [
        "On This Day: 2011 Tohoku Earthquake and Tsunami",
        "on-day-japans-deadly-2011-tohoku-earthquake-and-tsunami",
        "https://www.ncei.noaa.gov/news/day-2011-japan-earthquake-and-tsunami",
        "On March 11, 2011, a magnitude 9.1 earthquake struck off the northeast coast of Honshu, Japan, generating a deadly tsunami.",
      ],
    ]),
    source: {
      category: PLACEHOLDER_CATEGORY,
      extractionDisabled: true,
      id: 2,
      name: "NOAA News and Features",
      url: "https://www.noaa.gov/news-and-features",
    },
  },
  {
    basePath: "fda",
    seeds: createPlaceholderSeeds([
      [
        "FDA Approves First Gene Therapy for Severe Leukocyte Adhesion Deficiency Type I",
        "fda-approves-first-gene-therapy-severe-leukocyte-adhesion-deficiency-type-i",
        "https://www.fda.gov/news-events/press-announcements/fda-approves-first-gene-therapy-severe-leukocyte-adhesion-deficiency-type-i",
        "The U.S. Food and Drug Administration today approved Kresladi (marnetegragene autotemcel), the first gene therapy for the treatment of severe Leukocyte Adhesion Deficiency Type I (LAD-I).",
      ],
      [
        "FDA Takes Further Steps to Streamline Biosimilar Development and Make Medicines More Affordable",
        "fda-takes-further-steps-streamline-biosimilar-development-and-make-medicines-more-affordable",
        "https://www.fda.gov/news-events/press-announcements/fda-takes-further-steps-streamline-biosimilar-development-and-make-medicines-more-affordable",
        "The U.S. Food and Drug Administration today announced another major step in its initiative to streamline the development of biosimilar medicines, which are like \"generic\" versions of biologic drugs.",
      ],
      [
        "FDA Launches New Adverse Event Look-Up Tool",
        "fda-launches-new-adverse-event-look-tool",
        "https://www.fda.gov/news-events/press-announcements/fda-launches-new-adverse-event-look-tool",
        "FDA launched a new unified platform for analyzing adverse event reports through the FDA Adverse Event Monitoring System (AEMS).",
      ],
      [
        "FDA Approves First Treatment for Patients with Cerebral Folate Transport Deficiency",
        "fda-approves-first-treatment-patients-cerebral-folate-transport-deficiency",
        "https://www.fda.gov/news-events/press-announcements/fda-approves-first-treatment-patients-cerebral-folate-transport-deficiency",
        "The U.S. Food and Drug Administration today approved expanded use of Wellcovorin for the treatment of cerebral folate deficiency in adult and pediatric patients with a confirmed FOLR1 variant.",
      ],
      [
        "FDA Approves Fourth Product Under National Priority Voucher Program, Higher Dose Semaglutide",
        "fda-approves-fourth-product-under-national-priority-voucher-program-higher-dose-semaglutide",
        "https://www.fda.gov/news-events/press-announcements/fda-approves-fourth-product-under-national-priority-voucher-program-higher-dose-semaglutide",
        "The U.S. Food and Drug Administration today approved a new higher dose of Wegovy (semaglutide) injection for weight loss and long-term maintenance of weight loss for certain adult patients.",
      ],
      [
        "FDA Releases Draft Guidance on Alternatives to Animal Testing in Drug Development",
        "fda-releases-draft-guidance-alternatives-animal-testing-drug-development",
        "https://www.fda.gov/news-events/press-announcements/fda-releases-draft-guidance-alternatives-animal-testing-drug-development",
        "The U.S. Food and Drug Administration today issued draft guidance intended to help drug developers validate new approach methodologies to be used instead of animal testing in drug development.",
      ],
      [
        "FDA to Address Unused Opioids in American Homes",
        "fda-address-unused-opioids-american-homes",
        "https://www.fda.gov/news-events/press-announcements/fda-address-unused-opioids-american-homes",
        "The U.S. Food and Drug Administration today issued a request for information seeking public comment on potential new standards for in-home opioid disposal products.",
      ],
      [
        "FDA Approves Drug to Treat Neurologic Manifestations of Hunter Syndrome",
        "fda-approves-drug-treat-neurologic-manifestations-hunter-syndrome",
        "https://www.fda.gov/news-events/press-announcements/fda-approves-drug-treat-neurologic-manifestations-hunter-syndrome",
        "The U.S. Food and Drug Administration approved Avlayah (tividenofusp alfa-eknm) to treat certain individuals with Hunter syndrome (MPS II).",
      ],
    ]),
    source: {
      category: PLACEHOLDER_CATEGORY,
      extractionDisabled: true,
      id: 3,
      name: "FDA Press Announcements",
      url: "https://www.fda.gov/news-events/press-announcements",
    },
  },
  {
    basePath: "nist",
    seeds: createPlaceholderSeeds([
      [
        "NIST Helps Fingerprint Examiners With New Data and Software Release",
        "nist-helps-fingerprint-examiners-new-data-and-software-release",
        "https://www.nist.gov/news-events/news/2026/03/nist-helps-fingerprint-examiners-new-data-and-software-release",
        "The new tools are an annotated collection of 10,000 fingerprints and a software program that can sort fingerprints according to their quality.",
      ],
      [
        "Announcing the \"AI Agent Standards Initiative\" for Interoperable and Secure Innovation",
        "announcing-ai-agent-standards-initiative-interoperable-and-secure",
        "https://www.nist.gov/news-events/news/2026/02/announcing-ai-agent-standards-initiative-interoperable-and-secure",
        "The Initiative will ensure that the next generation of AI is widely adopted with confidence, can function securely on behalf of its users, and can interoperate smoothly across the digital ecosystem.",
      ],
      [
        "NIST Releases New Forensic Genetic Reference Material to Help Crime Laboratories Analyze Challenging Cases",
        "forensic-genetic-reference-material",
        "https://www.nist.gov/news-events/news/2026/02/nist-releases-new-forensic-genetic-reference-material-help-crime",
        "The reference material is the first to include mixtures of high-quality and degraded DNA from different individuals.",
      ],
      [
        "NIST Allocates Over $3 Million to Small Businesses Advancing AI, Biotechnology, Semiconductors, Quantum and More",
        "allocates-3-million-small-businesses",
        "https://www.nist.gov/news-events/news/2026/02/nist-allocates-over-3-million-small-businesses-advancing-ai-biotechnology",
        "NIST is allocating funding to eight small businesses in seven states under the Small Business Innovation Research program.",
      ],
      [
        "Space: The Final Frontier for Standards",
        "space-final-frontier-standards",
        "https://www.nist.gov/news-events/news/2026/02/space-final-frontier-standards",
        "Seven NIST reference materials, including house dust and freeze-dried human liver tissue, have been flown to the International Space Station.",
      ],
      [
        "CAISI Issues Request for Information About Securing AI Agent Systems",
        "caisi-ai-agent-systems-rfi",
        "https://www.nist.gov/news-events/news/2026/01/caisi-issues-request-information-about-securing-ai-agent-systems",
        "The Center for AI Standards and Innovation at the U.S. Department of Commerce's National Institute of Standards and Technology is seeking information about securing AI agent systems.",
      ],
      [
        "NIST Submits Annual Report to Congress Summarizing FY 2025 Progress on National Construction Safety Team Investigations",
        "nist-submits-annual-report-congress-summarizing-fy-2025-progress-national",
        "https://www.nist.gov/news-events/news/2026/03/nist-submits-annual-report-congress-summarizing-fy-2025-progress-national",
        "The report includes an overview of work completed on the Champlain Towers South investigation.",
      ],
    ]),
    source: {
      category: PLACEHOLDER_CATEGORY,
      extractionDisabled: true,
      id: 4,
      name: "NIST News",
      url: "https://www.nist.gov/news-events/news",
    },
  },
  {
    basePath: "dwr",
    seeds: createPlaceholderSeeds([
      [
        "Local Agencies Across California Continue Advancements Toward Groundwater Sustainability",
        "groundwater-sustainability-advancements",
        "https://water.ca.gov/News/News-Releases/2026/Mar-2026/Local-Agencies-Across-California-Continue-Advancements-Toward-Groundwater-Sustainability",
        "The Department of Water Resources has released the final version of California's Groundwater: Bulletin 118 - Update 2025, the state's most comprehensive report of groundwater monitoring, conditions, and management.",
      ],
      [
        "February Storms Provide a Much-Needed Boost but Statewide Snowpack Remains Below Average",
        "february-storms-snowpack-boost",
        "https://water.ca.gov/News/News-Releases/2026/Feb-2026/February-Storms-Provide-a-Much-Needed-Boost-but-Statewide-Snowpack-Remains-Below-Average",
        "With one month of the season left, critical Northern California watersheds are well below average after DWR's third snow survey of the season at Phillips Station.",
      ],
      [
        "Governor Newsom launches most ambitious water plan in California history",
        "california-water-plan-launch",
        "https://water.ca.gov/News/News-Releases/2026/Feb-2026/Governor-Newsom-launches-most-ambitious-water-plan-in-California-history",
        "For the first time in state history, California has a statewide water supply target of 9 million acre-feet by 2040.",
      ],
      [
        "Dry January Cuts into Early-Season Snowpack Gains",
        "dry-january-snowpack-gains",
        "https://water.ca.gov/News/News-Releases/2026/Jan-2026/Dry-January-Cuts-into-Early-Season-Snowpack-Gains",
        "DWR's second snow survey of the season found statewide snowpack at 59 percent of average for this date after a dry January.",
      ],
      [
        "December Storms Improved Flexibility Allow DWR to Increase State Water Project Allocation",
        "state-water-project-allocation",
        "https://water.ca.gov/News/News-Releases/2026/Jan-2026/December-Storms-Improved-Flexibility-Allow-DWR-to-Increase-State-Water-Project-Allocation",
        "DWR announced an increase to the State Water Project allocation for 2026 after December storms improved flexibility and supply conditions.",
      ],
      [
        "DWR Finalizes Best Management Practices to Help Address Subsidence and Protect California’s Water Infrastructure",
        "subsidence-best-practices",
        "https://water.ca.gov/News/News-Releases/2026/Jan-2026/Best-Management-Practices-to-Help-Address-Subsidence",
        "California's continued partnership with locals will serve as the key to safeguarding groundwater-reliant communities and infrastructure from land sinking.",
      ],
    ]),
    source: {
      category: PLACEHOLDER_CATEGORY,
      extractionDisabled: true,
      id: 5,
      name: "California DWR News",
      url: "https://water.ca.gov/News/News-Releases",
    },
  },
  {
    basePath: "caloes",
    seeds: createPlaceholderSeeds([
      [
        "Smart Giving: Helpful Ways to Support Disaster Survivors | Cal OES News",
        "smart-giving-helpful-ways-to-support-disaster-survivors",
        "https://www.news.caloes.ca.gov/smart-giving-helpful-ways-to-support-disaster-survivors/",
        "Cal OES outlines practical ways people can support disaster survivors through responsible giving after emergencies.",
      ],
    ]),
    source: {
      category: PLACEHOLDER_CATEGORY,
      extractionDisabled: true,
      id: 6,
      name: "Cal OES News",
      url: "https://www.news.caloes.ca.gov/",
    },
  },
  {
    basePath: "earthquake",
    seeds: createPlaceholderSeeds([
      [
        "How It Works – California Earthquake Early Warning",
        "how-it-works",
        "https://www.earthquake.ca.gov/how-it-works/",
        "California Earthquake Early Warning explains how alerts are detected, delivered, and used to give people seconds of warning before shaking arrives.",
      ],
    ]),
    source: {
      category: PLACEHOLDER_CATEGORY,
      extractionDisabled: true,
      id: 7,
      name: "California Earthquake Early Warning",
      url: "https://www.earthquake.ca.gov/",
    },
  },
  {
    basePath: "cgs",
    seeds: createPlaceholderSeeds([
      [
        "Publication Announcements",
        "releases",
        "https://www.conservation.ca.gov/cgs/publications/releases",
        "Release announcements of maps, reports and other publications of the California Geological Survey.",
      ],
    ]),
    source: {
      category: PLACEHOLDER_CATEGORY,
      extractionDisabled: true,
      id: 8,
      name: "California Geological Survey Publications",
      url: "https://www.conservation.ca.gov/cgs/publications/releases",
    },
  },
];

export const PLACEHOLDER_FEED_SOURCES: FeedSource[] =
  PLACEHOLDER_SOURCE_DEFINITIONS.map((definition) => definition.source);

const PLACEHOLDER_SNAPSHOT_PATH_BY_URL = Object.assign(
  {},
  ...PLACEHOLDER_SOURCE_DEFINITIONS.map(({ basePath, seeds }) =>
    buildPlaceholderSnapshotPathByUrl(basePath, seeds),
  ),
);

const PLACEHOLDER_ARTICLES_BY_SOURCE: Record<string, Article[]> = Object.fromEntries(
  PLACEHOLDER_SOURCE_DEFINITIONS.map(({ seeds, source }) => [
    normalizeFeedUrl(source.url),
    createPlaceholderArticles(source.id, seeds),
  ]),
);

export const getPlaceholderArticlesForSource = (url: string): Article[] =>
  PLACEHOLDER_ARTICLES_BY_SOURCE[tryNormalizeFeedUrl(url)] ?? [];

export const getPlaceholderSnapshotPathByArticleUrl = (
  url: string,
): null | string => {
  const normalizedUrl = tryNormalizeFeedUrl(url);
  return PLACEHOLDER_SNAPSHOT_PATH_BY_URL[normalizedUrl] ?? null;
};
