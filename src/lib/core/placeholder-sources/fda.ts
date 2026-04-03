import {
  createPlaceholderSeeds,
  type PlaceholderSourceDefinition,
} from "@/lib/core/placeholder-sources/types";

import { PLACEHOLDER_CATEGORY } from "./constants";

/** FDA placeholder feed used in database-free preview mode. */
export const FDA_PLACEHOLDER_SOURCE: PlaceholderSourceDefinition = {
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
};