import { LegalDocumentPage } from "@/app/app-components";
import { getTermsPageContent } from "@/app/app-components/legal";

/**
 * Renders the deployment-aware terms page.
 */
export default function TermsPage() {
  return <LegalDocumentPage {...getTermsPageContent()} />;
}
