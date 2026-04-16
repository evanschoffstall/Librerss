import { logger } from "@/lib";
import { toBodySnippet } from "@/lib/api/http";
import { isAllowedFeedUrl } from "@/lib/core";
import {
  detectResponseCompatibilitySignal,
  fetchHtmlWithHttpCloak,
  HttpCloakUpstreamError,
  pickDiagnosticHeaders,
  SOCKS_PROTOCOLS,
} from "@/lib/fetch";
import { redactUrlForLogs, toErrorMessage } from "@/lib/utils";

import { EXTRACT_403_RETRIES } from "./constants";

interface FetchHtmlDeps {
  delayFn?: (ms: number) => Promise<void>;
  httpCloakFetchFn?: typeof fetchHtmlWithHttpCloak;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
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
  url: string;
}

type ProxyMode = "direct" | "http" | "socks";

interface StageLogContext {
  [key: string]: unknown;
  allowInsecureTls: boolean;
  attempt: number;
  attempts: number;
  diagnosticHeaders?: ReturnType<typeof pickDiagnosticHeaders>;
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
 * Fetch article HTML through the HTTPCloak transport only, with SSRF-aware
 * redirect validation and bounded retry semantics for retryable responses.
 */
export async function fetchHtml(
  url: string,
  deps?: FetchHtmlDeps,
  options?: FetchHtmlOptions,
): Promise<string> {
  const { allowInsecureTls, delay, httpCloakFetchFn, isAllowedUrl, proxyUrl } =
    resolveFetchHtmlOptions(deps, options);
  const proxyMode = resolveProxyMode(proxyUrl);
  const redactProxyUrl = proxyUrl ? redactUrlForLogs(proxyUrl) : null;
  const httpCloakResult = await runHttpCloakStage({
    allowInsecureTls,
    attempts: 1 + EXTRACT_403_RETRIES,
    delayFn: delay,
    httpCloakFetchFn,
    isAllowedUrl,
    label: "HTTPCloak extraction",
    proxyMode,
    proxyUrl,
    redactProxyUrl,
    url,
  });
  if (httpCloakResult.ok) {
    return httpCloakResult.html;
  }
  if (isUrlValidationError(httpCloakResult.error)) {
    throw httpCloakResult.error;
  }

  throw asError(
    httpCloakResult.preferredError ?? httpCloakResult.error,
    "Upstream request failed",
  );
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

function createCompatibilityError(provider: string, statusCode: number): Error {
  return new Error(
    `Upstream request received a source access response (${provider}) [HTTP ${statusCode}]`,
  );
}

function finishStageSuccess(
  options: StageOptionsBase,
  attempt: number,
  result: Awaited<ReturnType<typeof fetchHtmlWithHttpCloak>>,
): FetchStageResult {
  logStageSuccess(
    options.label,
    buildStageLogContext(options, attempt, {
      diagnosticHeaders: result.diagnosticHeaders,
      headers: result.requestHeaders,
      redirectHop: result.redirectHop,
      responseBodyLength: result.html.length,
      statusCode: result.statusCode,
    }),
  );

  return { html: result.html, ok: true };
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

function resolveCompatibilityOutcome(error: unknown): {
  httpCloakUpstreamError: HttpCloakUpstreamError | null;
  preferredError?: Error;
  retryable: boolean;
  signal: ReturnType<typeof detectResponseCompatibilitySignal>["signal"];
} {
  const httpCloakUpstreamError =
    error instanceof HttpCloakUpstreamError ? error : null;
  if (!httpCloakUpstreamError) {
    return {
      httpCloakUpstreamError: null,
      retryable: false,
      signal: { detected: false } as const,
    };
  }

  const compatibility = detectResponseCompatibilitySignal(
    httpCloakUpstreamError.statusCode,
    httpCloakUpstreamError.responseHeaders as Record<string, unknown>,
    httpCloakUpstreamError.responseBody,
  );

  return {
    httpCloakUpstreamError,
    preferredError: compatibility.signal.detected
      ? createCompatibilityError(
          compatibility.signal.provider,
          httpCloakUpstreamError.statusCode,
        )
      : undefined,
    retryable: compatibility.retryable,
    signal: compatibility.signal,
  };
}

function resolveFetchHtmlOptions(
  deps: FetchHtmlDeps | undefined,
  options: FetchHtmlOptions | undefined,
) {
  const useProxy = options?.useProxy === true;

  return {
    allowInsecureTls: options?.allowInsecureTls === true,
    delay:
      deps?.delayFn ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    httpCloakFetchFn: deps?.httpCloakFetchFn ?? fetchHtmlWithHttpCloak,
    isAllowedUrl: deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl,
    proxyUrl: useProxy ? options.proxyUrl : undefined,
  };
}
function resolveProxyMode(proxyUrl: string | undefined): ProxyMode {
  if (proxyUrl) {
    return SOCKS_PROTOCOLS.has(new URL(proxyUrl).protocol) ? "socks" : "http";
  }

  return "direct";
}

function resolveStageFailureExtras(
  options: HttpCloakStageOptions,
  compatibility: ReturnType<typeof resolveCompatibilityOutcome>,
): Omit<StageLogExtras, "error"> {
  const { httpCloakUpstreamError } = compatibility;
  const responseBody = httpCloakUpstreamError?.responseBody;
  const responseHeaders = httpCloakUpstreamError?.responseHeaders;

  return {
    headers: httpCloakUpstreamError?.requestHeaders,
    note: compatibility.signal.detected
      ? `${compatibility.signal.provider} access constraint detected during HTTPCloak stage`
      : undefined,
    proxyMode: httpCloakUpstreamError?.proxyMode ?? options.proxyMode,
    redirectHop: httpCloakUpstreamError?.redirectHop,
    responseBodyLength: responseBody?.length,
    responseBodySnippet: responseBody ? toBodySnippet(responseBody) : undefined,
    responseHeaders: responseHeaders
      ? pickDiagnosticHeaders(responseHeaders)
      : undefined,
    statusCode: httpCloakUpstreamError?.statusCode,
  };
}

/**
 * Execute the shared HTTPCloak transport with bounded retries for retryable
 * upstream responses.
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
      const result = await options.httpCloakFetchFn(
        options.url,
        options.isAllowedUrl,
        {
          allowInsecureTls: options.allowInsecureTls,
          proxyUrl: options.proxyUrl,
        },
      );

      return finishStageSuccess(options, attempt, result);
    } catch (error) {
      lastError = error;

      const compatibility = resolveCompatibilityOutcome(error);
      if (compatibility.preferredError) {
        preferredError ??= compatibility.preferredError;
      }

      if (
        handleStageFailure(
          options,
          attempt,
          compatibility.retryable,
          error,
          resolveStageFailureExtras(options, compatibility),
        )
      ) {
        continue;
      }

      break;
    }
  }

  return { error: lastError, ok: false, preferredError };
}
