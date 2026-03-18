import { getPrivacyPageContent } from "../components/legal/content";
import { LegalDocumentPage } from "../components/LegalDocumentPage";

/**
 * Renders the deployment-aware privacy policy page.
 */
export default function PrivacyPage() {
  return <LegalDocumentPage {...getPrivacyPageContent()} />;
}
