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

/**
 * Describes the fetch HTML deps.
 */
interface FetchHtmlDeps {
  delayFn?: (ms: number) => Promise<void>;
  httpCloakFetchFn?: typeof fetchHtmlWithHttpCloak;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
}

/**
 * Describes the options for fetch HTML.
 */
interface FetchHtmlOptions {
  allowInsecureTls?: boolean;
  proxyUrl?: string;
  useProxy?: boolean;
}

/**
 * Describes the fetch stage result.
 */
type FetchStageResult =
  | { error: unknown; ok: false; preferredError?: Error }
  | { html: string; ok: true };

/**
 * Describes the options for HTTP cloak stage.
 */
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

/**
 * Defines the proxy mode type.
 */
type ProxyMode = "direct" | "http" | "socks";

/**
 * Describes the stage log context.
 */
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

/**
 * Defines the stage log extras type.
 */
type StageLogExtras = Omit<
  StageLogContext,
  "allowInsecureTls" | "attempt" | "attempts" | "proxyAddress" | "url"
> & {
  proxyMode?: ProxyMode;
};

/**
 * Describes the stage options base.
 */
interface StageOptionsBase {
  allowInsecureTls: boolean;
  attempts: number;
  label: string;
  proxyMode: ProxyMode;
  redactProxyUrl: null | string;
  url: string;
}

/**
 * Process the fetch html.
 * @param url - The url.
 * @param deps - The deps.
 * @param options - The options used to process the fetch html.
 * @returns The fetch html.
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

/**
 * Return the as error.
 * @param error - The error.
 * @param fallbackMessage - The fallback message.
 * @returns The as error.
 */
function asError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string" && error.length > 0) {
    return new Error(error);
  }

  return new Error(fallbackMessage);
}

/**
 * Build the stage log context.
 * @param options - The options used to build the stage log context.
 * @param attempt - The attempt.
 * @param extra - The extra.
 * @returns The stage log context.
 */
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

/**
 * Create the compatibility error.
 * @param provider - The provider.
 * @param statusCode - The status code.
 * @returns The compatibility error.
 */
function createCompatibilityError(provider: string, statusCode: number): Error {
  return new Error(
    `Upstream request received a source access response (${provider}) [HTTP ${statusCode}]`,
  );
}

/**
 * Process the finish stage success.
 * @param options - The options used to process the finish stage success.
 * @param attempt - The attempt.
 * @param result - The result.
 * @returns The finish stage success.
 */
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

/**
 * Process the handle stage failure.
 * @param options - The options used to process the handle stage failure.
 * @param attempt - The attempt.
 * @param retryable - The retryable.
 * @param error - The error.
 * @param extra - The extra.
 * @returns Whether handle stage failure.
 */
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

/**
 * Return whether is url validation error.
 * @param error - The error.
 * @returns Whether is url validation error.
 */
function isUrlValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Blocked URL" ||
      error.message === "Blocked redirect target")
  );
}

/**
 * Process the log stage failure.
 * @param label - The label.
 * @param willRetry - The will retry.
 * @param context - The context used to process the log stage failure.
 */
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

/**
 * Process the log stage success.
 * @param label - The label.
 * @param context - The context used to process the log stage success.
 */
function logStageSuccess(label: string, context: StageLogContext): void {
  logger.info(
    `${label} attempt ${context.attempt}/${context.attempts} succeeded`,
    context,
  );
}

/**
 * Resolve the compatibility outcome.
 * @param error - The error.
 * @returns The compatibility outcome.
 */
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

/**
 * Resolve the fetch html options.
 * @param deps - The deps.
 * @param options - The options used to resolve the fetch html options.
 * @returns The fetch html options.
 */
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
/**
 * Resolve the proxy mode.
 * @param proxyUrl - The proxy url.
 * @returns The proxy mode.
 */
function resolveProxyMode(proxyUrl: string | undefined): ProxyMode {
  if (proxyUrl) {
    return SOCKS_PROTOCOLS.has(new URL(proxyUrl).protocol) ? "socks" : "http";
  }

  return "direct";
}

/**
 * Resolve the stage failure extras.
 * @param options - The options used to resolve the stage failure extras.
 * @param compatibility - The compatibility.
 * @returns The stage failure extras.
 */
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
 * Process the run http cloak stage.
 * @param options - The options used to process the run http cloak stage.
 * @returns The run http cloak stage.
 */
async function runHttpCloakStage(
  options: HttpCloakStageOptions,
): Promise<FetchStageResult> {
  let lastError: unknown;
  let preferredError: Error | undefined;
  /**
   * Return the delay ms.
   * @param attempt - The attempt.
   * @returns The delay ms.
   */
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
