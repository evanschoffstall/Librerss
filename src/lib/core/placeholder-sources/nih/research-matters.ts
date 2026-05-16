import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-shared";
import { PLACEHOLDER_CATEGORY } from "@/lib/core/placeholder-shared";

/** NIH Research Matters placeholders collected from direct research highlight pages. */
export const NIH_RESEARCH_MATTERS_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition =
  {
    basePath: "nih-research-matters",
    seeds: createPlaceholderSeeds([
      [
        "Treating addiction",
        "treating-addiction",
        "https://www.nih.gov/news-events/nih-research-matters/treating-addiction",
        "This research-in-context feature surveys how scientists study the causes of addiction and potential treatments.",
      ],
      [
        "Blood test predicts start of Alzheimer’s disease symptoms",
        "blood-test-predicts-start-alzheimers-disease-symptoms",
        "https://www.nih.gov/news-events/nih-research-matters/blood-test-predicts-start-alzheimers-disease-symptoms",
        "Scientists developed an Alzheimer’s clock that estimates when symptoms may begin.",
      ],
      [
        "Machine learning analysis of CT scans",
        "machine-learning-analysis-ct-scans",
        "https://www.nih.gov/news-events/nih-research-matters/machine-learning-analysis-ct-scans",
        "An AI-powered tool can interpret 3D CT images and diagnose certain disorders.",
      ],
      [
        "Preventing organ transplant rejection",
        "preventing-organ-transplant-rejection",
        "https://www.nih.gov/news-events/nih-research-matters/preventing-organ-transplant-rejection",
        "Researchers found an unexpected role for lymphatic drainage in chronic organ rejection.",
      ],
      [
        "Immune cells may underlie sex differences in chronic pain",
        "immune-cells-may-underlie-sex-differences-chronic-pain",
        "https://www.nih.gov/news-events/nih-research-matters/immune-cells-may-underlie-sex-differences-chronic-pain",
        "A mouse study points to immune cells as one reason chronic pain is more common in women than men.",
      ],
      [
        "3D human liver reconstruction reveals changes in cirrhosis",
        "3d-human-liver-reconstruction-reveals-changes-cirrhosis",
        "https://www.nih.gov/news-events/nih-research-matters/3d-human-liver-reconstruction-reveals-changes-cirrhosis",
        "A detailed 3D liver reconstruction showed structural changes associated with cirrhosis.",
      ],
      [
        "Engineered immune cells target Alzheimer’s disease protein",
        "engineered-immune-cells-target-alzheimers-disease-protein",
        "https://www.nih.gov/news-events/nih-research-matters/engineered-immune-cells-target-alzheimers-disease-protein",
        "Scientists designed a T cell that reduced disease signs in a mouse model of Alzheimer’s.",
      ],
      [
        "Bacteria play key role in kidney stones",
        "bacteria-play-key-role-kidney-stones",
        "https://www.nih.gov/news-events/nih-research-matters/bacteria-play-key-role-kidney-stones",
        "Researchers found bacteria in kidney stones, including types once thought to contain none.",
      ],
      [
        "How the environment can shape future allergies",
        "how-environment-can-shape-future-allergies",
        "https://www.nih.gov/news-events/nih-research-matters/how-environment-can-shape-future-allergies",
        "Early exposure to microbes and allergens may help protect against overactive immune responses.",
      ],
      [
        "How age alters sepsis outcomes",
        "how-age-alters-sepsis-outcomes",
        "https://www.nih.gov/news-events/nih-research-matters/how-age-alters-sepsis-outcomes",
        "A biological pathway that helps young mice survive severe infection has the opposite effect in older mice.",
      ],
    ]),
    source: {
      category: PLACEHOLDER_CATEGORY,
      extractionDisabled: true,
      id: 17,
      name: "NIH Research Matters",
      url: "https://www.nih.gov/nih-research-matters/feed.xml",
    },
  };
