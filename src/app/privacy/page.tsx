import { LegalDocumentPage } from "@/app/app-components";
import { getPrivacyPageContent } from "@/app/app-components/legal";

/**
 * Renders the deployment-aware privacy policy page.
 */
export default function PrivacyPage() {
  return <LegalDocumentPage {...getPrivacyPageContent()} />;
}
