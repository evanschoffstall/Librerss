/**
 * Defines the source compatibility signal type.
 */
export type SourceCompatibilitySignal =
  | {
      challengeCookies: string[];
      detected: true;
      provider:
        | "Akamai"
        | "Cloudflare"
        | "DataDome"
        | "PerimeterX"
        | "reCAPTCHA";
    }
  | { detected: false };

/**
 * Defines the compatibility provider type.
 */
type CompatibilityProvider =
  | "Akamai"
  | "Cloudflare"
  | "DataDome"
  | "PerimeterX"
  | "reCAPTCHA";

/**
 * Process the detect response compatibility signal.
 * @param responseStatus - The response status.
 * @param headers - The headers.
 * @param responseBody - The response body.
 * @returns The detect response compatibility signal.
 */
export function detectResponseCompatibilitySignal(
  responseStatus: number | undefined,
  headers: Record<string, unknown> | undefined,
  responseBody: string,
): { retryable: boolean; signal: SourceCompatibilitySignal } {
  const challengeCookies = getChallengeCookies(headers);
  const responseBodyLower = responseBody.toLowerCase();
  const responseHeaderKeys = getLowercaseHeaderKeys(headers);

  if (responseStatus !== 403 && responseStatus !== 429) {
    return isAkamaiChallenge(responseBody)
      ? createDetectedResponse("Akamai", challengeCookies)
      : { retryable: false, signal: { detected: false } };
  }

  if (isDataDomeChallenge(headers)) {
    return createDetectedResponse("DataDome", challengeCookies);
  }

  if (isPerimeterXChallenge(responseBody, responseHeaderKeys)) {
    return createDetectedResponse("PerimeterX", []);
  }

  if (isCloudflareChallenge(headers, responseBody)) {
    return createDetectedResponse("Cloudflare", challengeCookies);
  }

  if (isRecaptchaChallenge(responseBody, responseBodyLower)) {
    return createDetectedResponse("reCAPTCHA", []);
  }

  if (isAkamaiChallenge(responseBody)) {
    return createDetectedResponse("Akamai", challengeCookies);
  }

  return { retryable: true, signal: { detected: false } };
}

/**
 * Create the detected response.
 * @param provider - The provider.
 * @param challengeCookies - The challenge cookies.
 * @returns The detected response.
 */
function createDetectedResponse(
  provider: CompatibilityProvider,
  challengeCookies: string[],
) {
  return {
    retryable: false,
    signal: {
      challengeCookies,
      detected: true,
      provider,
    } as const,
  };
}

/**
 * Return the challenge cookies.
 * @param headers - The headers.
 * @returns The challenge cookies.
 */
function getChallengeCookies(headers: Record<string, unknown> | undefined) {
  const setCookie = headers?.["set-cookie"];
  return Array.isArray(setCookie)
    ? setCookie.filter((value): value is string => typeof value === "string")
    : typeof setCookie === "string"
      ? [setCookie]
      : [];
}

/**
 * Return the lowercase header keys.
 * @param headers - The headers.
 * @returns The lowercase header keys.
 */
function getLowercaseHeaderKeys(headers: Record<string, unknown> | undefined) {
  return Object.keys(headers ?? {}).map((header) => header.toLowerCase());
}

/**
 * Process the header text.
 * @param headers - The headers.
 * @param key - The key.
 * @returns The header text.
 */
function headerText(headers: Record<string, unknown> | undefined, key: string) {
  const value = headers?.[key];
  return Array.isArray(value)
    ? value.join(";").toLowerCase()
    : typeof value === "string"
      ? value.toLowerCase()
      : "";
}

/**
 * Detects Akamai interstitials that can arrive with HTTP 200 even though the
 * body is an access challenge rather than publisher article HTML.
 * @param responseBody - Decoded upstream response body.
 * @returns Whether the body contains Akamai challenge markers.
 */
function isAkamaiChallenge(responseBody: string): boolean {
  return /sec-if-cpt-container|scf-akamai-logo|errors\.edgesuite\.net|powered and protected by/i.test(
    responseBody,
  );
}

/**
 * Return whether is cloudflare challenge.
 * @param headers - The headers.
 * @param responseBody - The response body.
 * @returns Whether is cloudflare challenge.
 */
function isCloudflareChallenge(
  headers: Record<string, unknown> | undefined,
  responseBody: string,
) {
  return (
    headerText(headers, "cf-mitigated") === "challenge" ||
    /attention required!?\s*\|\s*cloudflare|cf-browser-verification|__cf_chl_|\/cdn-cgi\/challenge-platform|cf challenge/i.test(
      responseBody,
    )
  );
}

/**
 * Return whether is data dome challenge.
 * @param headers - The headers.
 * @returns Whether is data dome challenge.
 */
function isDataDomeChallenge(headers: Record<string, unknown> | undefined) {
  return headerText(headers, "x-datadome") === "protected";
}

/**
 * Return whether is perimeter x challenge.
 * @param responseBody - The response body.
 * @param responseHeaderKeys - The response header keys.
 * @returns Whether is perimeter x challenge.
 */
function isPerimeterXChallenge(
  responseBody: string,
  responseHeaderKeys: string[],
) {
  return (
    /px[-_]captcha|perimeterx|\/_px\//i.test(responseBody) ||
    responseHeaderKeys.some((header) => header.startsWith("x-px-"))
  );
}

/**
 * Return whether is recaptcha challenge.
 * @param responseBody - The response body.
 * @param responseBodyLower - The response body lower.
 * @returns Whether is recaptcha challenge.
 */
function isRecaptchaChallenge(responseBody: string, responseBodyLower: string) {
  return (
    /(?:^|\W)g-recaptcha(?:\W|$)|grecaptcha(?:\W|$)|recaptcha\/api(?:2)?(?:\.js|\/anchor|\/reload)|google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(
      responseBody,
    ) || responseBodyLower.includes("i'm not a robot")
  );
}
