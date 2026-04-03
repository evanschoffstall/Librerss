import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** NINDS press release placeholders collected from direct institute press pages. */
export const NINDS_PRESS_RELEASES_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
  basePath: "ninds-press-releases",
  seeds: createPlaceholderSeeds([
    [
      "NIH halts arm of clinical trial evaluating a potential stroke treatment",
      "nih-halts-arm-clinical-trial-evaluating-potential-stroke-treatment",
      "https://www.ninds.nih.gov/news-events/news/press-releases/nih-halts-arm-clinical-trial-evaluating-potential-stroke-treatment",
      "A clinical trial review found low-dose rivaroxaban to be unsafe and ineffective compared with standard care.",
    ],
    [
      "NIH-funded study clearly ties risk of dementia to severe CTE",
      "nih-funded-study-clearly-ties-risk-dementia-severe-cte",
      "https://www.ninds.nih.gov/news-events/news/press-releases/nih-funded-study-clearly-ties-risk-dementia-severe-cte",
      "A large NIH-funded analysis found the clearest link yet between severe CTE and dementia risk.",
    ],
    [
      "A fresh energy supply may shield nerves from diabetic or chemo-induced neuropathy",
      "fresh-energy-supply-may-shield-nerves-diabetic-or-chemo-induced-neuropathy",
      "https://www.ninds.nih.gov/news-events/news/press-releases/fresh-energy-supply-may-shield-nerves-diabetic-or-chemo-induced-neuropathy",
      "Researchers found that restoring mitochondrial support between cells may reduce neuropathy pain and nerve damage.",
    ],
    [
      "Repeated head impacts cause early neuron loss and inflammation in young athletes",
      "repeated-head-impacts-cause-early-neuron-loss-and-inflammation-young-athletes",
      "https://www.ninds.nih.gov/news-events/news/press-releases/repeated-head-impacts-cause-early-neuron-loss-and-inflammation-young-athletes",
      "NIH-supported work found early brain changes from repeated head impacts years before hallmark CTE features appear.",
    ],
    [
      "Acupuncture treatment improves disabling effects of chronic low back pain in older adults",
      "acupuncture-treatment-improves-disabling-effects-chronic-low-back-pain-older-adults",
      "https://www.ninds.nih.gov/news-events/news/press-releases/acupuncture-treatment-improves-disabling-effects-chronic-low-back-pain-older-adults",
      "The NIH-funded trial found acupuncture improved function and reduced pain for older adults with chronic low back pain.",
    ],
    [
      "Decoding inner speech from brain signals",
      "decoding-inner-speech-brain-signals",
      "https://www.ninds.nih.gov/news-events/news/press-releases/decoding-inner-speech-brain-signals",
      "Scientists built a brain-computer interface that decodes inner speech from motor-cortex activity in real time.",
    ],
    [
      "NIH-funded study identifies potential new stroke treatment",
      "nih-funded-study-identifies-potential-new-stroke-treatment",
      "https://www.ninds.nih.gov/news-events/news/press-releases/nih-funded-study-identifies-potential-new-stroke-treatment",
      "A preclinical stroke study found uric acid improved long-term outcomes in rodent models.",
    ],
    [
      "NIH-funded research team engineers new drug targeting pain sensation pathway",
      "nih-funded-research-team-engineers-new-drug-targeting-pain-sensation-pathway",
      "https://www.ninds.nih.gov/news-events/news/press-releases/nih-funded-research-team-engineers-new-drug-targeting-pain-sensation-pathway",
      "The new CB1-targeting compound showed promise as a safer non-addictive pain treatment in animal models.",
    ],
  ]),
  source: {
    category: PLACEHOLDER_CATEGORY,
    extractionDisabled: true,
    id: 19,
    name: "NINDS Press Releases",
    url: "https://www.ninds.nih.gov/news-events/press-releases/press-releases.rss",
  },
};