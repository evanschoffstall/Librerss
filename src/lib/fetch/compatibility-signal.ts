export type SourceCompatibilitySignal =
  | {
      challengeCookies: string[];
      detected: true;
      provider: "Cloudflare" | "DataDome" | "PerimeterX" | "reCAPTCHA";
    }
  | { detected: false };

type CompatibilityProvider =
  | "Cloudflare"
  | "DataDome"
  | "PerimeterX"
  | "reCAPTCHA";

/**
 * Detect whether an upstream response looks like a bot-management challenge
 * and whether retrying the same profile has a reasonable chance of success.
 * @param responseStatus
 * @param headers
 * @param responseBody
 */
export function detectResponseCompatibilitySignal(
  responseStatus: number | undefined,
  headers: Record<string, unknown> | undefined,
  responseBody: string,
): { retryable: boolean; signal: SourceCompatibilitySignal } {
  if (responseStatus !== 403 && responseStatus !== 429) {
    return { retryable: false, signal: { detected: false } };
  }

  const challengeCookies = getChallengeCookies(headers);
  const responseBodyLower = responseBody.toLowerCase();
  const responseHeaderKeys = getLowercaseHeaderKeys(headers);

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

  return { retryable: true, signal: { detected: false } };
}

/**
 * @param provider
 * @param challengeCookies
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
 * @param headers
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
 * @param headers
 */
function getLowercaseHeaderKeys(headers: Record<string, unknown> | undefined) {
  return Object.keys(headers ?? {}).map((header) => header.toLowerCase());
}

/**
 * @param headers
 * @param key
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
 * @param headers
 * @param responseBody
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
 * @param headers
 */
function isDataDomeChallenge(headers: Record<string, unknown> | undefined) {
  return headerText(headers, "x-datadome") === "protected";
}

/**
 * @param responseBody
 * @param responseHeaderKeys
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
 * @param responseBody
 * @param responseBodyLower
 */
function isRecaptchaChallenge(responseBody: string, responseBodyLower: string) {
  return (
    /(?:^|\W)g-recaptcha(?:\W|$)|grecaptcha(?:\W|$)|recaptcha\/api(?:2)?(?:\.js|\/anchor|\/reload)|google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(
      responseBody,
    ) || responseBodyLower.includes("i'm not a robot")
  );
}
