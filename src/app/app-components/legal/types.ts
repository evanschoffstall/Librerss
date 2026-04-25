import type { ReactNode } from "react";

/** Props for the shared legal document shell used by privacy and terms pages. */
export interface LegalDocumentPageProps {
  contactCard: ReactNode;
  eyebrow: string;
  footerLinks: readonly {
    href: string;
    label: string;
  }[];
  intro: string;
  lastUpdated: string;
  returnHref: string;
  returnLabel: string;
  sections: readonly LegalSection[];
  title: string;
}

/** One section of long-form legal copy rendered on the privacy and terms pages. */
export interface LegalSection {
  body: string;
  id: string;
  title: string;
}
