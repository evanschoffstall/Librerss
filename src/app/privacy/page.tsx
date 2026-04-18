import { LegalDocumentPage } from "@/app/app-components";
import { getPrivacyPageContent } from "@/app/app-components/legal";

/**
 * Render the privacy page component.
 * @returns The rendered privacy page component.
 */
export default function PrivacyPage() {
  return <LegalDocumentPage {...getPrivacyPageContent()} />;
}
