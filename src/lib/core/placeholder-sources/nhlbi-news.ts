import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** NHLBI news placeholders collected from direct institute news pages. */
export const NHLBI_NEWS_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "nhlbi-news",
  seeds: createPlaceholderSeeds([
    [
      "Vitamin D supplements may slow cellular aging",
      "vitamin-d-supplements-may-slow-cellular-aging",
      "https://www.nhlbi.nih.gov/news/2025/vitamin-d-supplements-may-slow-cellular-aging",
      "An NIH-backed study linked vitamin D supplementation with slower measures of cellular aging.",
    ],
    [
      "Blood pressure patterns in early pregnancy tied to hypertension risk up to 14 years later",
      "blood-pressure-patterns-early-pregnancy-tied-hypertension-risk-14-years-later",
      "https://www.nhlbi.nih.gov/news/2025/blood-pressure-patterns-early-pregnancy-tied-hypertension-risk-14-years-later",
      "NIH-supported research identified a new early-pregnancy risk group for later high blood pressure.",
    ],
    [
      "Social factors help explain worse cardiovascular health among adults in rural vs. urban communities",
      "social-factors-help-explain-worse-cardiovascular-health-among-adults-rural-vs-urban",
      "https://www.nhlbi.nih.gov/news/2025/social-factors-help-explain-worse-cardiovascular-health-among-adults-rural-vs-urban",
      "Researchers found that poverty, education, and related conditions help explain rural heart-health gaps.",
    ],
    [
      "Surgery in kids with mild sleep-disordered breathing tied to fewer doctor visits, meds",
      "surgery-kids-mild-sleep-disordered-breathing-tied-fewer-doctor-visits-meds",
      "https://www.nhlbi.nih.gov/news/2025/surgery-kids-mild-sleep-disordered-breathing-tied-fewer-doctor-visits-meds",
      "The NIH-funded study supports adenotonsillectomy for children in this at-risk group.",
    ],
    [
      "Spotlight on UPFs: NIH explores link between ultra-processed foods and heart disease",
      "spotlight-upfs-nih-explores-link-between-ultra-processed-foods-and-heart-disease",
      "https://www.nhlbi.nih.gov/news/2025/spotlight-upfs-nih-explores-link-between-ultra-processed-foods-and-heart-disease",
      "NHLBI researchers review what is known and still uncertain about ultra-processed foods and heart disease.",
    ],
    [
      "Longer breastfeeding linked to blood-pressure lowering effects of certain infant gut bacteria",
      "longer-breastfeeding-linked-blood-pressure-lowering-effects-certain-infant-gut-bacteria",
      "https://www.nhlbi.nih.gov/news/2025/longer-breastfeeding-linked-blood-pressure-lowering-effects-certain-infant-gut-bacteria",
      "Breastfeeding for at least six months may encourage beneficial gut bacteria tied to later heart health.",
    ],
    [
      "Why some cancer treatments are harming the heart – and what researchers are doing about it",
      "why-some-cancer-treatments-are-harming-heart-and-what-researchers-are-doing-about-it",
      "https://www.nhlbi.nih.gov/news/2025/why-some-cancer-treatments-are-harming-heart-and-what-researchers-are-doing-about-it",
      "NHLBI highlights research into the cardiac side effects of cancer therapies and possible protections.",
    ],
    [
      "Extra fat in muscles linked to heart disease risks",
      "extra-fat-muscles-linked-heart-disease-risks",
      "https://www.nhlbi.nih.gov/news/2025/extra-fat-muscles-linked-heart-disease-risks",
      "This indicator improved predictions for major heart problems among adults with limited blood flow to the heart.",
    ],
    [
      "When it comes to the health benefits of coffee, timing may count",
      "when-it-comes-health-benefits-coffee-timing-may-count",
      "https://www.nhlbi.nih.gov/news/2025/when-it-comes-health-benefits-coffee-timing-may-count",
      "Morning coffee drinkers had lower long-term mortality associations in a study of more than 40,000 adults.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 18,
    name: "NHLBI All News",
    url: "https://www.nhlbi.nih.gov/news",
  },
};
