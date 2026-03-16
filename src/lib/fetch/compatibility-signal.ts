import axios from "axios";

export type SourceCompatibilitySignal =
  | {
      challengeCookies: string[];
      detected: true;
      provider: "Cloudflare" | "DataDome" | "PerimeterX" | "reCAPTCHA";
    }
  | { detected: false };

export function detectSourceCompatibilitySignal(
  error: unknown,
  isAxiosError: typeof axios.isAxiosError,
): { retryable: boolean; signal: SourceCompatibilitySignal } {
  if (!isAxiosError(error)) {
    return { retryable: false, signal: { detected: false } };
  }

  const resp = (
    error as {
      response?: {
        data?: unknown;
        headers?: Record<string, unknown>;
        status?: number;
      };
    }
  ).response;
  const responseStatus = resp?.status;
  if (responseStatus !== 403 && responseStatus !== 429) {
    return { retryable: false, signal: { detected: false } };
  }

  const headers = resp?.headers;
  const challengeCookies = getChallengeCookies(headers);
  const responseBody = typeof resp?.data === "string" ? resp.data : "";
  const responseBodyLower = responseBody.toLowerCase();
  const responseHeaderKeys = Object.keys(headers ?? {}).map((header) =>
    header.toLowerCase(),
  );

  const ddHeader = headerText(headers, "x-datadome");
  if (ddHeader === "protected") {
    return {
      retryable: false,
      signal: { challengeCookies, detected: true, provider: "DataDome" },
    };
  }

  const isPx =
    /px[-_]captcha|perimeterx|\/_px\//i.test(responseBody) ||
    responseHeaderKeys.some((header) => header.startsWith("x-px-"));
  if (isPx) {
    return {
      retryable: false,
      signal: {
        challengeCookies: [],
        detected: true,
        provider: "PerimeterX",
      },
    };
  }

  const isCloudflare =
    headerText(headers, "cf-mitigated") === "challenge" ||
    /attention required!?\s*\|\s*cloudflare|cf-browser-verification|__cf_chl_|\/cdn-cgi\/challenge-platform|cf challenge/i.test(
      responseBody,
    );
  if (isCloudflare) {
    return {
      retryable: false,
      signal: {
        challengeCookies,
        detected: true,
        provider: "Cloudflare",
      },
    };
  }

  const isRecaptcha =
    /(?:^|\W)g-recaptcha(?:\W|$)|grecaptcha(?:\W|$)|recaptcha\/api(?:2)?(?:\.js|\/anchor|\/reload)|google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(
      responseBody,
    ) || responseBodyLower.includes("i'm not a robot");
  if (isRecaptcha) {
    return {
      retryable: false,
      signal: {
        challengeCookies: [],
        detected: true,
        provider: "reCAPTCHA",
      },
    };
  }

  return { retryable: true, signal: { detected: false } };
}

function getChallengeCookies(headers: Record<string, unknown> | undefined) {
  const setCookie = headers?.["set-cookie"];
  return Array.isArray(setCookie)
    ? setCookie.filter((value): value is string => typeof value === "string")
    : typeof setCookie === "string"
      ? [setCookie]
      : [];
}

function headerText(headers: Record<string, unknown> | undefined, key: string) {
  const value = headers?.[key];
  return Array.isArray(value)
    ? value.join(";").toLowerCase()
    : typeof value === "string"
      ? value.toLowerCase()
      : "";
}