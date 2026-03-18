import { getTermsPageContent } from "../components/legal/content";
import { LegalDocumentPage } from "../components/LegalDocumentPage";

/**
 * Renders the deployment-aware terms page.
 */
export default function TermsPage() {
  return <LegalDocumentPage {...getTermsPageContent()} />;
}
