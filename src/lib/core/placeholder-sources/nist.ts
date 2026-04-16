import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** NIST placeholder feed used in database-free preview mode. */
export const NIST_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "nist",
  seeds: createPlaceholderSeeds([
    [
      "NIST Helps Fingerprint Examiners With New Data and Software Release",
      "nist-helps-fingerprint-examiners-new-data-and-software-release",
      "https://www.nist.gov/news-events/news/2026/03/nist-helps-fingerprint-examiners-new-data-and-software-release",
      "The new tools are an annotated collection of 10,000 fingerprints and a software program that can sort fingerprints according to their quality.",
    ],
    [
      'Announcing the "AI Agent Standards Initiative" for Interoperable and Secure Innovation',
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
};
