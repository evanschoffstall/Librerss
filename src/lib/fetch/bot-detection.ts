import axios from "axios";

export type BotDetection =
  | { detected: false }
  | {
      detected: true;
      provider: "Cloudflare" | "DataDome" | "PerimeterX" | "reCAPTCHA";
      challengeCookies: string[];
    };

function headerText(headers: Record<string, unknown> | undefined, key: string) {
  const value = headers?.[key];
  return Array.isArray(value)
    ? value.join(";").toLowerCase()
    : String(value ?? "").toLowerCase();
}

function getChallengeCookies(headers: Record<string, unknown> | undefined) {
  const setCookie = headers?.["set-cookie"];
  return Array.isArray(setCookie)
    ? setCookie.filter((v): v is string => typeof v === "string")
    : typeof setCookie === "string"
      ? [setCookie]
      : [];
}

export function detectBotProtection(
  error: unknown,
  isAxiosError: typeof axios.isAxiosError,
): { retryable: boolean; bot: BotDetection } {
  if (!isAxiosError(error))
    return { retryable: false, bot: { detected: false } };
  const resp = (
    error as {
      response?: {
        status?: number;
        headers?: Record<string, unknown>;
        data?: unknown;
      };
    }
  ).response;
  const responseStatus = resp?.status;
  if (responseStatus !== 403 && responseStatus !== 429)
    return { retryable: false, bot: { detected: false } };

  const headers = resp?.headers;
  const challengeCookies = getChallengeCookies(headers);
  const responseBody = String(resp?.data ?? "");
  const responseBodyLower = responseBody.toLowerCase();
  const responseHeaderKeys = Object.keys(headers ?? {}).map((h) =>
    h.toLowerCase(),
  );

  const ddHeader = headerText(headers, "x-datadome");
  if (ddHeader === "protected") {
    return {
      retryable: false,
      bot: { detected: true, provider: "DataDome", challengeCookies },
    };
  }

  const isPx =
    /px[-_]captcha|perimeterx|\/_px\//i.test(responseBody) ||
    responseHeaderKeys.some((h) => h.startsWith("x-px-"));
  if (isPx)
    return {
      retryable: false,
      bot: { detected: true, provider: "PerimeterX", challengeCookies: [] },
    };

  const isCloudflare =
    headerText(headers, "cf-mitigated") === "challenge" ||
    /attention required!?\s*\|\s*cloudflare|cf-browser-verification|__cf_chl_|\/cdn-cgi\/challenge-platform|cf challenge/i.test(
      responseBody,
    );
  if (isCloudflare)
    return {
      retryable: false,
      bot: { detected: true, provider: "Cloudflare", challengeCookies },
    };

  const isRecaptcha =
    /(?:^|\W)g-recaptcha(?:\W|$)|grecaptcha(?:\W|$)|recaptcha\/api(?:2)?(?:\.js|\/anchor|\/reload)|google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(
      responseBody,
    ) || responseBodyLower.includes("i'm not a robot");
  if (isRecaptcha)
    return {
      retryable: false,
      bot: { detected: true, provider: "reCAPTCHA", challengeCookies: [] },
    };

  return { retryable: true, bot: { detected: false } };
}
