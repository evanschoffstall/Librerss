import axios from "axios";

export type BotDetection =
  | {
      challengeCookies: string[];
      detected: true;
      provider: "Cloudflare" | "DataDome" | "PerimeterX" | "reCAPTCHA";
    }
  | { detected: false };

export function detectBotProtection(
  error: unknown,
  isAxiosError: typeof axios.isAxiosError,
): { bot: BotDetection; retryable: boolean } {
  if (!isAxiosError(error))
    return { bot: { detected: false }, retryable: false };
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
  if (responseStatus !== 403 && responseStatus !== 429)
    return { bot: { detected: false }, retryable: false };

  const headers = resp?.headers;
  const challengeCookies = getChallengeCookies(headers);
  const responseBody = typeof resp?.data === "string" ? resp.data : "";
  const responseBodyLower = responseBody.toLowerCase();
  const responseHeaderKeys = Object.keys(headers ?? {}).map((h) =>
    h.toLowerCase(),
  );

  const ddHeader = headerText(headers, "x-datadome");
  if (ddHeader === "protected") {
    return {
      bot: { challengeCookies, detected: true, provider: "DataDome" },
      retryable: false,
    };
  }

  const isPx =
    /px[-_]captcha|perimeterx|\/_px\//i.test(responseBody) ||
    responseHeaderKeys.some((h) => h.startsWith("x-px-"));
  if (isPx)
    return {
      bot: { challengeCookies: [], detected: true, provider: "PerimeterX" },
      retryable: false,
    };

  const isCloudflare =
    headerText(headers, "cf-mitigated") === "challenge" ||
    /attention required!?\s*\|\s*cloudflare|cf-browser-verification|__cf_chl_|\/cdn-cgi\/challenge-platform|cf challenge/i.test(
      responseBody,
    );
  if (isCloudflare)
    return {
      bot: { challengeCookies, detected: true, provider: "Cloudflare" },
      retryable: false,
    };

  const isRecaptcha =
    /(?:^|\W)g-recaptcha(?:\W|$)|grecaptcha(?:\W|$)|recaptcha\/api(?:2)?(?:\.js|\/anchor|\/reload)|google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(
      responseBody,
    ) || responseBodyLower.includes("i'm not a robot");
  if (isRecaptcha)
    return {
      bot: { challengeCookies: [], detected: true, provider: "reCAPTCHA" },
      retryable: false,
    };

  return { bot: { detected: false }, retryable: true };
}

function getChallengeCookies(headers: Record<string, unknown> | undefined) {
  const setCookie = headers?.["set-cookie"];
  return Array.isArray(setCookie)
    ? setCookie.filter((v): v is string => typeof v === "string")
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
