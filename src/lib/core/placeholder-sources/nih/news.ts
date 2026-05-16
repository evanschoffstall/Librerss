import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-shared";
import { PLACEHOLDER_CATEGORY } from "@/lib/core/placeholder-shared";

/** NIH news release placeholders collected from direct public RSS items. */
export const NIH_NEWS_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "nih-news",
  seeds: createPlaceholderSeeds([
    [
      "NIH researchers discover pain-relieving drug with minimal addictive properties",
      "nih-researchers-discover-pain-relieving-drug-minimal-addictive-properties",
      "https://www.nih.gov/news-events/news-releases/nih-researchers-discover-pain-relieving-drug-minimal-addictive-properties",
      "Positive safety results surprised researchers studying a shelved class of synthetic opioids.",
    ],
    [
      "NIH awards top scientific teams for innovations linking nutrition and autoimmune disease",
      "nih-awards-top-scientific-teams-innovations-linking-nutrition-autoimmune-disease",
      "https://www.nih.gov/news-events/news-releases/nih-awards-top-scientific-teams-innovations-linking-nutrition-autoimmune-disease",
      "The competition backed bold ideas about how dietary interventions may influence autoimmune disease onset and symptoms.",
    ],
    [
      "Chronic inflammation leaves long-lasting impression on gut stem cells, increasing colorectal cancer risk",
      "chronic-inflammation-leaves-long-lasting-impression-gut-stem-cells-increasing-colorectal-cancer-risk",
      "https://www.nih.gov/news-events/news-releases/chronic-inflammation-leaves-long-lasting-impression-gut-stem-cells-increasing-colorectal-cancer-risk",
      "An NIH-funded animal study found durable cellular memories of damage long after inflammation stopped.",
    ],
    [
      "NIH invests $150 million in human-based research to reduce use of animal models",
      "nih-invests-150-million-human-based-research-reduce-use-animal-models",
      "https://www.nih.gov/news-events/news-releases/nih-invests-150-million-human-based-research-reduce-use-animal-models",
      "The new program will develop and standardize more sophisticated human-based disease models.",
    ],
    [
      "Clinical trial results support use of weekly extended-release buprenorphine for treatment of opioid use disorder during pregnancy",
      "clinical-trial-results-support-use-weekly-extended-release-buprenorphine-treatment-opioid-use-disorder-during-pregnancy",
      "https://www.nih.gov/news-events/news-releases/clinical-trial-results-support-use-weekly-extended-release-buprenorphine-treatment-opioid-use-disorder-during-pregnancy",
      "NIH-supported results showed higher illicit-opioid abstinence rates than the current standard of care.",
    ],
    [
      "Researchers develop AI tool to predict patients at risk of intimate partner violence",
      "researchers-develop-ai-tool-predict-patients-risk-intimate-partner-violence",
      "https://www.nih.gov/news-events/news-releases/researchers-develop-ai-tool-predict-patients-risk-intimate-partner-violence",
      "The NIH-funded clinical decision support system aims to identify at-risk patients earlier.",
    ],
    [
      "Automated CT scan analysis could fast-track clinical assessments",
      "automated-ct-scan-analysis-could-fast-track-clinical-assessments",
      "https://www.nih.gov/news-events/news-releases/automated-ct-scan-analysis-could-fast-track-clinical-assessments",
      "Researchers say an AI-powered tool could speed diagnosis and reveal early chronic-disease markers.",
    ],
    [
      "Study measuring changes in protein structure establishes new class of Alzheimer’s biomarkers",
      "study-measuring-changes-protein-structure-establishes-new-class-alzheimers-biomarkers",
      "https://www.nih.gov/news-events/news-releases/study-measuring-changes-protein-structure-establishes-new-class-alzheimers-biomarkers",
      "The NIH-funded work may support earlier diagnosis and improve future Alzheimer’s clinical trials.",
    ],
    [
      "NIH-supported trial reduces HIV incidence by 70% in rural populations",
      "nih-supported-trial-reduces-hiv-incidence-70-rural-populations",
      "https://www.nih.gov/news-events/news-releases/nih-supported-trial-reduces-hiv-incidence-70-rural-populations",
      "The study used technology to extend care infrastructure into harder-to-reach rural communities.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 16,
    name: "NIH News Releases",
    url: "https://www.nih.gov/news-releases/feed.xml",
  },
};
