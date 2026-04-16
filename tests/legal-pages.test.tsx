import { render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import {
  getLegalDeploymentProfile,
  getPrivacyPageContent,
  getTermsPageContent,
} from "@/app/app-components/legal/content";
import { LegalDocumentPage } from "@/app/app-components/LegalDocumentPage";

const LEGAL_ENV_KEYS = [
  "LEGAL_DEPLOYMENT_NAME",
  "LEGAL_OPERATOR_NAME",
  "LEGAL_PROFILE",
  "OPERATOR_CONTACT_EMAIL",
] as const;

const legalEnvSnapshot = new Map<string, string | undefined>(
  LEGAL_ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const [key, value] of legalEnvSnapshot) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
});

describe("legal deployment content", () => {
  test("uses generic defaults when deployment env is unset", () => {
    for (const key of LEGAL_ENV_KEYS) {
      delete process.env[key];
    }

    expect(getLegalDeploymentProfile()).toEqual({
      deploymentName: "this deployment",
      operatorContactEmail: undefined,
      operatorName: undefined,
      profile: "generic",
    });

    const privacyPage = getPrivacyPageContent();
    const view = render(<LegalDocumentPage {...privacyPage} />);

    expect(
      view.getByRole("heading", {
        name: "Privacy policy for this LibreRSS deployment.",
      }),
    ).toBeTruthy();
    expect(
      view.getByText(
        /Contact the person or organization operating this deployment\./u,
      ),
    ).toBeTruthy();

    const backLinks = view.getAllByRole("link", { name: "Back to landing" });
    expect(backLinks.length).toBeGreaterThan(0);
    expect(backLinks[0]?.getAttribute("href")).toBe("/landing");

    expect(view.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe(
      "/terms",
    );
    expect(view.getByText(/Last updated:/u)).toBeTruthy();
  });

  test("builds official privacy and terms content with operator contact details", () => {
    process.env.LEGAL_PROFILE = "official";
    process.env.LEGAL_DEPLOYMENT_NAME = "LibreRSS Cloud";
    process.env.LEGAL_OPERATOR_NAME = "Example Operator";
    process.env.OPERATOR_CONTACT_EMAIL = "privacy@example.com";

    const privacyPage = getPrivacyPageContent();
    const termsPage = getTermsPageContent();

    expect(privacyPage.title).toBe("Privacy policy for LibreRSS Cloud.");
    expect(termsPage.title).toBe("Terms for LibreRSS Cloud.");
    expect(privacyPage.sections).toHaveLength(6);
    expect(termsPage.sections).toHaveLength(8);

    const view = render(<LegalDocumentPage {...termsPage} />);

    expect(
      view.getByRole("heading", { name: "Terms for LibreRSS Cloud." }),
    ).toBeTruthy();
    expect(
      view.getByRole("link", { name: "privacy@example.com" }),
    ).toBeTruthy();
    expect(
      view.getByText(
        /Example Operator is the operator responsible for this deployment\./u,
      ),
    ).toBeTruthy();
    expect(
      view.getByRole("link", { name: "Privacy Policy" }).getAttribute("href"),
    ).toBe("/privacy");
  });

  test("rejects invalid operator contact emails", () => {
    process.env.OPERATOR_CONTACT_EMAIL = "not-an-email";

    expect(() => getLegalDeploymentProfile()).toThrow(
      "OPERATOR_CONTACT_EMAIL must be a valid email address when provided.",
    );
  });
});
