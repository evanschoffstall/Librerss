import { LegalDocumentPage } from "@/app/app-components";
import { getTermsPageContent } from "@/app/app-components/legal";

/**
 * Render the terms page component.
 * @returns The rendered terms page component.
 */
export default function TermsPage() {
  return <LegalDocumentPage {...getTermsPageContent()} />;
}
