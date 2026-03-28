import axios from "axios";

import { toBodySnippet } from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import { isAllowedFeedUrl } from "@/lib/core/feed-url-validator";
import { fetchTextWithValidatedRedirects } from "@/lib/core/upstream-http";
import {
  buildAxiosGet,
  buildDdgReferer,
  buildProxyConfig,
  CHROME,
  detectResponseCompatibilitySignal,
  detectSourceCompatibilitySignal,
  fetchHtmlWithHttpCloak,
  GotScrapingError,
  pickDiagnosticHeaders,
  SOCKS_PROTOCOLS,
} from "@/lib/fetch";
import { logger } from "@/lib/logger";
import { toErrorMessage } from "@/lib/utils/errors";
import { redactUrlForLogs } from "@/lib/utils/url";

import {
  EXTRACT_403_RETRIES,
} from "./constants";

interface AxiosStageOptions {
  allowInsecureTls: boolean;
  attempts: number;
  delayFn: (ms: number) => Promise<void>;
  headersFactory: (attempt: number) => Record<string, string>;
  injectedGet?: typeof axios.get;
  isAllowedUrl: (candidateUrl: string) => Promise<boolean>;
  isAxiosError: typeof axios.isAxiosError;
  label: string;
  proxyConfig?: ReturnType<typeof buildProxyConfig>;
  proxyMode: ProxyMode;
  redactProxyUrl: null | string;
  timeoutMs: number;
  url: string;
}

interface FetchHtmlDeps {
  axiosGetFn?: typeof axios.get;
  delayFn?: (ms: number) => Promise<void>;
  httpCloakFetchFn?: typeof fetchHtmlWithHttpCloak;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  isAxiosErrorFn?: typeof axios.isAxiosError;
}

interface FetchHtmlOptions {
  allowInsecureTls?: boolean;
  proxyUrl?: string;
  useProxy?: boolean;
}

type FetchStageResult =
  | { error: unknown; ok: false; preferredError?: Error }
  | { html: string; ok: true };

interface HttpCloakStageOptions {
  allowInsecureTls: boolean;
  attempts: number;
  delayFn: (ms: number) => Promise<void>;
  httpCloakFetchFn: typeof fetchHtmlWithHttpCloak;
  isAllowedUrl: (candidateUrl: string) => Promise<boolean>;
  label: string;
  proxyMode: ProxyMode;
  proxyUrl?: string;
  redactProxyUrl: null | string;
  referer: string;
  url: string;
}

type ProxyMode = "direct" | "http" | "socks";

interface StageLogContext {
  [key: string]: unknown;
  allowInsecureTls: boolean;
  attempt: number;
  attempts: number;
  error?: string;
  headers?: Record<string, string | string[] | undefined>;
  note?: string;
  proxyAddress: null | string;
  proxyMode: ProxyMode;
  redirectHop?: number;
  responseBodyLength?: number;
  responseBodySnippet?: string;
  responseHeaders?: ReturnType<typeof pickDiagnosticHeaders>;
  statusCode?: number;
  url: string;
}

type StageLogExtras = Omit<
  StageLogContext,
  "allowInsecureTls" | "attempt" | "attempts" | "proxyAddress" | "url"
> & {
  proxyMode?: ProxyMode;
};

interface StageOptionsBase {
  allowInsecureTls: boolean;
  attempts: number;
  label: string;
  proxyMode: ProxyMode;
  redactProxyUrl: null | string;
  url: string;
}

/**
 * Fetch article HTML using a strongest-first transport pipeline: HTTPCloak
 * first, browser-profile axios second, and plain axios last.
 */
export async function fetchHtml(
  url: string,
  deps?: FetchHtmlDeps,
  options?: FetchHtmlOptions,
): Promise<string> {
  const isAllowedUrl = deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;
  const delay =
    deps?.delayFn ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const injectedGet = deps?.axiosGetFn;
  const httpCloakFetchFn = deps?.httpCloakFetchFn ?? fetchHtmlWithHttpCloak;
  const allowInsecureTls = options?.allowInsecureTls === true;
  const useProxy = options?.useProxy === true;
  const configuredProxyUrl = options?.proxyUrl;
  const timeoutMs = CONFIG.FEED_REQUEST_TIMEOUT_MS;
  const referer = buildDdgReferer(url);
  const proxyUrl = useProxy ? configuredProxyUrl : undefined;
  const proxyConfig =
    proxyUrl && !injectedGet
      ? buildProxyConfig(proxyUrl, allowInsecureTls) || undefined
      : undefined;
  const proxyMode = resolveProxyMode(proxyUrl, proxyConfig?.mode);
  const redactProxyUrl = proxyUrl ? redactUrlForLogs(proxyUrl) : null;
  let preferredError: Error | undefined;
  const hasInjectedHttpCloakFetch = deps?.httpCloakFetchFn !== undefined;

  const canRunHttpCloakStage = !injectedGet || hasInjectedHttpCloakFetch;
  if (canRunHttpCloakStage) {
    const httpCloakResult = await runHttpCloakStage({
      allowInsecureTls,
      attempts: 1 + EXTRACT_403_RETRIES,
      delayFn: delay,
      httpCloakFetchFn,
      isAllowedUrl,
      label: useProxy ? "HTTPCloak extraction" : "HTTPCloak-first extraction",
      proxyMode,
      proxyUrl,
      redactProxyUrl,
      referer,
      url,
    });

    if (httpCloakResult.ok) {
      return httpCloakResult.html;
    }

    if (isUrlValidationError(httpCloakResult.error)) {
      throw httpCloakResult.error;
    }

    preferredError ??= httpCloakResult.preferredError;
  }

  const browserLikeAxiosResult = await runAxiosStage({
    allowInsecureTls,
    attempts: injectedGet ? 1 : 1 + EXTRACT_403_RETRIES,
    delayFn: delay,
    headersFactory: () => createBrowserLikeAxiosHeaders(referer),
    injectedGet,
    isAllowedUrl,
    isAxiosError,
    label: "Browser-profile extraction",
    proxyConfig,
    proxyMode,
    redactProxyUrl,
    timeoutMs,
    url,
  });
  if (browserLikeAxiosResult.ok) {
    return browserLikeAxiosResult.html;
  }
  if (isUrlValidationError(browserLikeAxiosResult.error)) {
    throw browserLikeAxiosResult.error;
  }
  preferredError ??= browserLikeAxiosResult.preferredError;

  const plainAxiosResult = await runAxiosStage({
    allowInsecureTls,
    attempts: 1,
    delayFn: delay,
    headersFactory: () => createPlainAxiosHeaders(),
    injectedGet,
    isAllowedUrl,
    isAxiosError,
    label: "Plain axios extraction",
    proxyConfig,
    proxyMode,
    redactProxyUrl,
    timeoutMs,
    url,
  });
  if (plainAxiosResult.ok) {
    return plainAxiosResult.html;
  }
  if (isUrlValidationError(plainAxiosResult.error)) {
    throw plainAxiosResult.error;
  }
  preferredError ??= plainAxiosResult.preferredError;

  throw asError(preferredError ?? plainAxiosResult.error, "Upstream request failed");
}

function asError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string" && error.length > 0) {
    return new Error(error);
  }

  return new Error(fallbackMessage);
}

function buildStageLogContext(
  options: StageOptionsBase,
  attempt: number,
  extra: StageLogExtras,
): StageLogContext {
  const { proxyMode, ...rest } = extra;

  return {
    allowInsecureTls: options.allowInsecureTls,
    attempt: attempt + 1,
    attempts: options.attempts,
    proxyAddress: options.redactProxyUrl,
    proxyMode: proxyMode ?? options.proxyMode,
    url: options.url,
    ...rest,
  };
}

function createBrowserLikeAxiosHeaders(
  referer: string,
): Record<string, string> {
  return {
    Accept: CHROME.accept,
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
    Priority: "u=0, i",
    Referer: referer,
    "sec-ch-ua": CHROME.secChUa,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": CHROME.secChUaPlatform,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": CHROME.userAgent,
  };
}

function createCompatibilityError(provider: string, statusCode: number): Error {
  return new Error(
    `Upstream request received a source access response (${provider}) [HTTP ${statusCode}]`,
  );
}

function createPlainAxiosHeaders(): Record<string, string> {
  return {
    Accept: CHROME.accept,
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": CHROME.userAgent,
  };
}

function finishStageSuccess(
  options: StageOptionsBase,
  attempt: number,
  headers: Record<string, string | string[] | undefined> | undefined,
  html: string,
): FetchStageResult {
  logStageSuccess(
    options.label,
    buildStageLogContext(options, attempt, {
      headers,
      responseBodyLength: html.length,
    }),
  );

  return { html, ok: true };
}

function handleStageFailure(
  options: StageOptionsBase,
  attempt: number,
  retryable: boolean,
  error: unknown,
  extra: Omit<StageLogExtras, "error">,
): boolean {
  const willRetry = retryable && attempt < options.attempts - 1;

  logStageFailure(
    options.label,
    willRetry,
    buildStageLogContext(options, attempt, {
      error: toErrorMessage(error),
      ...extra,
    }),
  );

  return willRetry;
}

function isUrlValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Blocked URL" ||
      error.message === "Blocked redirect target")
  );
}

function logStageFailure(
  label: string,
  willRetry: boolean,
  context: StageLogContext,
): void {
  logger.error(
    `${label} attempt ${context.attempt}/${context.attempts} failed${willRetry ? " (will retry)" : " (final)"}`,
    context,
  );
}

function logStageSuccess(label: string, context: StageLogContext): void {
  logger.info(
    `${label} attempt ${context.attempt}/${context.attempts} succeeded`,
    context,
  );
}

function resolveProxyMode(
  proxyUrl: string | undefined,
  resolvedProxyMode?: Exclude<ProxyMode, "direct">,
): ProxyMode {
  if (resolvedProxyMode) {
    return resolvedProxyMode;
  }

  if (proxyUrl) {
    return SOCKS_PROTOCOLS.has(new URL(proxyUrl).protocol) ? "socks" : "http";
  }

  return "direct";
}

/**
 * Run an axios-backed stage with explicit redirect validation and optional
 * explicit fallback handling between stronger and weaker request profiles.
 */
async function runAxiosStage(
  options: AxiosStageOptions,
): Promise<FetchStageResult> {
  let lastError: unknown;
  let preferredError: Error | undefined;

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    if (attempt > 0) {
      await options.delayFn(600 * attempt);
    }

    const requestHeaders = options.headersFactory(attempt);
    const axiosGet = buildAxiosGet(
      options.injectedGet,
      options.proxyConfig,
      options.allowInsecureTls && !options.injectedGet,
    );

    let isFirstValidation = true;
    const retryState = { current: false };

    try {
      const html = await fetchTextWithValidatedRedirects(
        {
          assertAllowedUrl: async (candidateUrl) => {
            if (!(await options.isAllowedUrl(candidateUrl))) {
              throw new Error(
                isFirstValidation ? "Blocked URL" : "Blocked redirect target",
              );
            }

            isFirstValidation = false;
          },
          headers: requestHeaders,
          maxContentLengthBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
          maxRedirects: 5,
          onAxiosError: (error, isAxios) => {
            const compatibility = detectSourceCompatibilitySignal(error, isAxios);
            retryState.current = compatibility.retryable;
            if (!compatibility.signal.detected) {
              return;
            }

            const compatibilityError =
              preferredError ??
              createCompatibilityError(compatibility.signal.provider, 403);
            preferredError = compatibilityError;
            throw compatibilityError;
          },
          timeoutMs: options.timeoutMs,
          url: options.url,
        },
        {
          axiosGetFn: axiosGet,
          isAxiosErrorFn: options.isAxiosError,
        },
      );

      return finishStageSuccess(options, attempt, requestHeaders, html);
    } catch (error) {
      lastError = error;

      if (
        handleStageFailure(options, attempt, retryState.current, error, {
          headers: requestHeaders,
        })
      ) {
        continue;
      }

      break;
    }
  }

  return { error: lastError, ok: false, preferredError };
}

/**
 * Execute the strongest transport first so the more compatible upstream client runs
 * before cheaper but less compatible fallbacks.
 */
async function runHttpCloakStage(
  options: HttpCloakStageOptions,
): Promise<FetchStageResult> {
  let lastError: unknown;
  let preferredError: Error | undefined;
  const getDelayMs = (attempt: number) =>
    800 * attempt + Math.floor(Math.random() * 400);

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    if (attempt !== 0) {
      await options.delayFn(getDelayMs(attempt));
    }

    try {
      const { html, requestHeaders } = await options.httpCloakFetchFn(
        options.url,
        options.isAllowedUrl,
        {
          accept: CHROME.accept,
          allowInsecureTls: options.allowInsecureTls,
          proxyUrl: options.proxyUrl,
          referer: options.referer,
          secChUa: CHROME.secChUa,
        },
      );

      return finishStageSuccess(options, attempt, requestHeaders, html);
    } catch (error) {
      lastError = error;

      const gotScrapingError = error instanceof GotScrapingError ? error : null;
      const compatibility = gotScrapingError
        ? detectResponseCompatibilitySignal(
            gotScrapingError.statusCode,
            gotScrapingError.responseHeaders as Record<string, unknown>,
            gotScrapingError.responseBody,
          )
        : { retryable: false, signal: { detected: false } as const };

      if (compatibility.signal.detected && gotScrapingError) {
        preferredError ??= createCompatibilityError(
          compatibility.signal.provider,
          gotScrapingError.statusCode,
        );
      }

      if (
        handleStageFailure(options, attempt, compatibility.retryable, error, {
          headers: gotScrapingError?.requestHeaders,
          note: compatibility.signal.detected
            ? `${compatibility.signal.provider} access constraint detected during HTTPCloak stage`
            : undefined,
          proxyMode: gotScrapingError ? gotScrapingError.proxyMode : options.proxyMode,
          redirectHop: gotScrapingError?.redirectHop,
          responseBodyLength: gotScrapingError?.responseBody.length,
          responseBodySnippet: gotScrapingError
            ? toBodySnippet(gotScrapingError.responseBody)
            : undefined,
          responseHeaders: gotScrapingError
            ? pickDiagnosticHeaders(gotScrapingError.responseHeaders)
            : undefined,
          statusCode: gotScrapingError?.statusCode,
        })
      ) {
        continue;
      }

      break;
    }
  }

  return { error: lastError, ok: false, preferredError };
}
