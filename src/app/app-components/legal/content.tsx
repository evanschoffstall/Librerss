import type { ReactNode } from "react";

import type { LegalDocumentPageProps, LegalSection } from "./types";

import { LEGAL_LAST_UPDATED } from "./metadata";

const LEGAL_PROFILES = ["generic", "official"] as const;
const DEFAULT_GENERIC_DEPLOYMENT_NAME = "this deployment";
const DEFAULT_OFFICIAL_DEPLOYMENT_NAME = "Librerss.com";
const DEFAULT_OFFICIAL_OPERATOR_NAME = "Evan Schoffstall";

/**
 * Deployment-specific legal metadata used to separate product-level copy from
 * operator-specific policy details.
 */
interface LegalDeploymentProfile {
  deploymentName: string;
  operatorContactEmail?: string;
  operatorName?: string;
  profile: LegalProfile;
}

type LegalProfile = (typeof LEGAL_PROFILES)[number];

/**
 * Process the trim optional env.
 * @param rawValue - The raw value.
 * @returns The trim optional env.
 */
const trimOptionalEnv = (rawValue: string | undefined): string | undefined => {
  if (rawValue === undefined) {
    return undefined;
  }

  const trimmedValue = rawValue.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
};

/**
 * Process the read optional display env.
 * @param key - The key.
 * @param rawValue - The raw value.
 * @param maximumLength - The maximum length value.
 * @returns The read optional display env.
 */
const readOptionalDisplayEnv = (
  key: string,
  rawValue: string | undefined,
  maximumLength: number,
): string | undefined => {
  const value = trimOptionalEnv(rawValue);

  if (value === undefined) {
    return undefined;
  }

  if (value.length > maximumLength) {
    throw new Error(
      `${key} must be ${maximumLength} characters or fewer when provided.`,
    );
  }

  return value;
};

/**
 * Process the read optional email env.
 * @param key - The key.
 * @param rawValue - The raw value.
 * @returns The read optional email env.
 */
const readOptionalEmailEnv = (
  key: string,
  rawValue: string | undefined,
): string | undefined => {
  const value = trimOptionalEnv(rawValue);

  if (value === undefined) {
    return undefined;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
    throw new Error(`${key} must be a valid email address when provided.`);
  }

  return value;
};

/**
 * Process the read legal profile.
 * @returns The read legal profile.
 */
const readLegalProfile = (): LegalProfile => {
  const rawValue = trimOptionalEnv(process.env.LEGAL_PROFILE)?.toLowerCase();

  if (rawValue === undefined) {
    return "generic";
  }

  if (LEGAL_PROFILES.includes(rawValue as LegalProfile)) {
    return rawValue as LegalProfile;
  }

  throw new Error(
    `LEGAL_PROFILE must be one of: ${LEGAL_PROFILES.join(", ")}.`,
  );
};

/**
 * Return the legal deployment profile.
 * @returns The legal deployment profile.
 */
export const getLegalDeploymentProfile = (): LegalDeploymentProfile => {
  const profile = readLegalProfile();
  const deploymentName =
    readOptionalDisplayEnv(
      "LEGAL_DEPLOYMENT_NAME",
      process.env.LEGAL_DEPLOYMENT_NAME,
      80,
    ) ?? resolveDefaultDeploymentName(profile);
  const operatorName =
    readOptionalDisplayEnv(
      "LEGAL_OPERATOR_NAME",
      process.env.LEGAL_OPERATOR_NAME,
      80,
    ) ?? resolveDefaultOperatorName(profile);

  return {
    deploymentName,
    operatorContactEmail: readOptionalEmailEnv(
      "OPERATOR_CONTACT_EMAIL",
      process.env.OPERATOR_CONTACT_EMAIL,
    ),
    operatorName,
    profile,
  };
};

/**
 * Resolve the default deployment name.
 * @param profile - The profile.
 * @returns The default deployment name.
 */
function resolveDefaultDeploymentName(profile: LegalProfile): string {
  return profile === "official"
    ? DEFAULT_OFFICIAL_DEPLOYMENT_NAME
    : DEFAULT_GENERIC_DEPLOYMENT_NAME;
}

/**
 * Resolve the default operator name.
 * @param profile - The profile.
 * @returns The default operator name.
 */
function resolveDefaultOperatorName(profile: LegalProfile): string | undefined {
  return profile === "official" ? DEFAULT_OFFICIAL_OPERATOR_NAME : undefined;
}

/**
 * Build the contact card.
 * @param profile - The profile.
 * @param topicLabel - The topic label.
 * @returns The contact card.
 */
const buildContactCard = (
  profile: LegalDeploymentProfile,
  topicLabel: string,
): ReactNode => {
  if (profile.operatorContactEmail && profile.operatorName) {
    return (
      <>
        For {topicLabel} about {profile.deploymentName}, contact{" "}
        <a
          className="font-medium text-foreground underline underline-offset-4"
          href={`mailto:${profile.operatorContactEmail}`}
        >
          {profile.operatorContactEmail}
        </a>
        . {profile.operatorName} is the operator responsible for this
        deployment. Other LibreRSS operators should publish their own contact
        details and policies.
      </>
    );
  }

  if (profile.operatorContactEmail) {
    return (
      <>
        For {topicLabel} about {profile.deploymentName}, contact{" "}
        <a
          className="font-medium text-foreground underline underline-offset-4"
          href={`mailto:${profile.operatorContactEmail}`}
        >
          {profile.operatorContactEmail}
        </a>
        . Other LibreRSS operators should publish their own contact details and
        policies.
      </>
    );
  }

  if (profile.operatorName) {
    return `${profile.operatorName} is the operator responsible for ${profile.deploymentName}. Contact details should be published wherever this deployment is offered.`;
  }

  return `Contact the person or organization operating ${profile.deploymentName}. Other LibreRSS deployments are responsible for publishing and maintaining their own legal details.`;
};

/**
 * Build the privacy sections.
 * @param profile - The profile.
 * @returns The privacy sections.
 */
const buildPrivacySections = (
  profile: LegalDeploymentProfile,
): readonly LegalSection[] => [
  {
    body: `${profile.deploymentName} is a deployment of the LibreRSS software. This privacy policy applies only to this deployment. Anyone else who runs LibreRSS needs to publish and maintain their own policy for their own service.`,
    id: "scope",
    title: "Scope of this policy",
  },
  {
    body: "If you create an account, this deployment may store your email address, password hash, session records, feed subscriptions, category labels, reading state, and display preferences. Browser-only preferences may also be stored locally on the device you use.",
    id: "account-data",
    title: "Data this deployment stores",
  },
  {
    body: "When feed refresh or article extraction runs, this deployment contacts the source website and may retry with different request profiles or saved connection settings to improve compatibility. If proxy settings are saved for your account, proxy usernames may be stored with those settings and saved proxy passwords are encrypted before storage so the deployment can reuse them until you change or remove them. Other LibreRSS deployments or future releases may handle these settings differently.",
    id: "network-data",
    title: "Network requests and compatibility data",
  },
  {
    body:
      profile.profile === "official"
        ? `${profile.deploymentName} currently uses Vercel Analytics for aggregate site usage and performance telemetry. It also keeps operational logs for authentication, account changes, feed refreshes, and proxy compatibility checks so the service can be secured and debugged. Other LibreRSS deployments, and future LibreRSS versions, may use different providers, different retention practices, or no analytics at all.`
        : `Retention, logging, analytics, and infrastructure choices are controlled by the operator of ${profile.deploymentName}, not by the LibreRSS codebase in the abstract. Those choices can be different on every deployment, and future LibreRSS versions may change what features or providers are involved.`,
    id: "operations",
    title: "Operations, analytics, and retention",
  },
  {
    body: "The settings modal includes options to export your account data and delete your account. Deleting an account removes user-owned records from the application database through cascading deletes, subject to any short-lived operational records still required for security or reliability.",
    id: "controls",
    title: "Your controls",
  },
  {
    body: `Questions about privacy, stored data, or account handling should go to the operator responsible for ${profile.deploymentName}.`,
    id: "contact",
    title: "Questions or requests",
  },
];

/**
 * Build the terms sections.
 * @param profile - The profile.
 * @returns The terms sections.
 */
const buildTermsSections = (
  profile: LegalDeploymentProfile,
): readonly LegalSection[] => [
  {
    body: `${profile.deploymentName} is a deployment of the LibreRSS software. These terms apply to this deployment. Other LibreRSS websites or self-hosted installs can set different rules, support terms, and operating practices.`,
    id: "scope",
    title: "Scope of these terms",
  },
  {
    body: "You are responsible for the feed URLs, account credentials, and optional connection settings you provide. You agree not to use this deployment in a way that breaks applicable law, infringes another party's rights, or violates source-site rules that apply to you.",
    id: "responsibilities",
    title: "Your responsibilities",
  },
  {
    body: "Feeds and article content come from third-party sources. LibreRSS and this deployment do not claim ownership of that material, and source publishers remain responsible for their own content, availability, and policies.",
    id: "content",
    title: "Third-party content and source sites",
  },
  {
    body: `Availability, moderation, support, and operational decisions for ${profile.deploymentName} are controlled by that deployment's operator. The LibreRSS project does not guarantee that every deployment will behave the same way.`,
    id: "operations",
    title: "Operator responsibility",
  },
  {
    body: "This deployment is provided on an as-is, best-effort basis and may change, pause, or stop at any time. The operator may update or remove features without guaranteeing ongoing availability.",
    id: "warranty",
    title: "No warranty",
  },
  {
    body: "To the fullest extent allowed by applicable law, the operator of this deployment is not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of data, profits, business, or goodwill arising from your use of the service. If liability cannot be fully excluded, it is limited to the smallest amount the law allows.",
    id: "liability",
    title: "Limitation of liability",
  },
  {
    body: "You can review the privacy policy, export your account data, and delete your account from the settings modal while signed in.",
    id: "account-controls",
    title: "Account controls",
  },
  {
    body: `Support, policy, or legal questions should go to the operator responsible for ${profile.deploymentName}.`,
    id: "contact",
    title: "Questions and contact",
  },
];

/**
 * Return the privacy page content.
 * @returns The privacy page content.
 */
export const getPrivacyPageContent = (): LegalDocumentPageProps => {
  const profile = getLegalDeploymentProfile();

  return {
    contactCard: buildContactCard(profile, "privacy questions"),
    eyebrow: "Privacy Policy",
    footerLinks: [
      { href: "/terms", label: "Terms" },
      { href: "/landing", label: "Back to landing" },
    ],
    intro: `${profile.deploymentName} is a deployment of LibreRSS, not the policy source for every LibreRSS install. This page keeps the promises for this deployment separate from whatever another operator may do with their own instance.`,
    lastUpdated: LEGAL_LAST_UPDATED,
    returnHref: "/landing",
    returnLabel: "Back to landing",
    sections: buildPrivacySections(profile),
    title:
      profile.profile === "official"
        ? `Privacy policy for ${profile.deploymentName}.`
        : "Privacy policy for this LibreRSS deployment.",
  };
};

/**
 * Return the terms page content.
 * @returns The terms page content.
 */
export const getTermsPageContent = (): LegalDocumentPageProps => {
  const profile = getLegalDeploymentProfile();

  return {
    contactCard: buildContactCard(
      profile,
      "support, policy, or legal questions",
    ),
    eyebrow: "Terms of Use",
    footerLinks: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/landing", label: "Back to landing" },
    ],
    intro: `${profile.deploymentName} is a deployment of LibreRSS. These terms are intentionally scoped to this deployment so other operators are free to define and maintain their own terms for their own sites.`,
    lastUpdated: LEGAL_LAST_UPDATED,
    returnHref: "/landing",
    returnLabel: "Back to landing",
    sections: buildTermsSections(profile),
    title:
      profile.profile === "official"
        ? `Terms for ${profile.deploymentName}.`
        : "Terms for this LibreRSS deployment.",
  };
};
