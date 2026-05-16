import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { CONFIG, logger } from "@/lib";
import {
  fetchHtmlWithHttpCloak,
  HttpCloakUpstreamError,
  pickDiagnosticHeaders,
} from "@/lib/fetch";
import { resolveUserProxy } from "@/lib/outbound-proxy";
import { serverApi } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const COMPATIBILITY_CHECK_SITES = [
  {
    label: "PennLive sample",
    url: "https://www.pennlive.com/",
    vendor: "DataDome",
  },
  {
    label: "ABC27 sample",
    url: "https://www.abc27.com/",
    vendor: "PerimeterX",
  },
  {
    label: "Cloudflare sample",
    url: "https://www.cloudflare.com/",
    vendor: "Cloudflare",
  },
  {
    label: "Ticketmaster sample",
    url: "https://ticketmaster.com/",
    vendor: "reCAPTCHA",
  },
] as const;

/**
 * Describes the compatibility check deps.
 */
interface CompatibilityCheckDeps {
  fetchHtmlWithHttpCloakFn?: typeof fetchHtmlWithHttpCloak;
  httpCloakUpstreamErrorClass?: typeof HttpCloakUpstreamError;
  loggerInstance?: typeof logger;
  parseJsonBodyOrResponseFn?: (
    request: NextRequest,
  ) => Promise<CompatibilityCheckRequest | Response>;
  pickDiagnosticHeadersFn?: typeof pickDiagnosticHeaders;
  rateLimitConfig?: {
    maxAttempts: number;
    windowMs: number;
  };
  requireMutableAuthenticatedUserFn?: typeof serverApi.requireMutableAuthenticatedUser;
  resolveUserProxyFn?: typeof resolveUserProxy;
  serviceErrorClass?: typeof serverApi.ServerServiceError;
}

/**
 * Describes the compatibility check execution context.
 */
interface CompatibilityCheckExecutionContext {
  allowInsecureTls: boolean;
  loggerInstance: typeof logger;
  proxyUrl?: string;
  useProxy: boolean;
  userId: number;
}

/**
 * Describes the compatibility check request.
 */
interface CompatibilityCheckRequest {
  useProxy?: boolean;
}

/**
 * Describes the compatibility check result.
 */
interface CompatibilityCheckResult {
  compatibilitySignalDetected: boolean;
  error?: string;
  responseSize?: number;
  site: string;
  statusCode?: number;
  success: boolean;
  url: string;
  vendor: string;
}

/**
 * Describes the resolved compatibility check deps.
 */
interface ResolvedCompatibilityCheckDeps {
  fetchHtmlWithHttpCloakFn: typeof fetchHtmlWithHttpCloak;
  httpCloakUpstreamErrorClass: typeof HttpCloakUpstreamError;
  loggerInstance: typeof logger;
  parseJsonBodyOrResponseFn: (
    request: NextRequest,
  ) => Promise<CompatibilityCheckRequest | Response>;
  pickDiagnosticHeadersFn: typeof pickDiagnosticHeaders;
  rateLimitConfig: {
    maxAttempts: number;
    windowMs: number;
  };
  requireMutableAuthenticatedUserFn: typeof serverApi.requireMutableAuthenticatedUser;
  resolveUserProxyFn: typeof resolveUserProxy;
  serviceErrorClass: typeof serverApi.ServerServiceError;
}

/**
 * Describes the resolved user proxy configuration.
 */
interface ResolvedUserProxyConfig {
  allowInsecureTls: boolean;
  proxyUrl?: string;
}

/**
 * Handle the POST request.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns A JSON response or error response.
 */
export async function POST(
  request: NextRequest,
  depsOrContext: CompatibilityCheckDeps | serverApi.RouteHandlerContext = {},
) {
  const deps = resolveCompatibilityCheckDeps(
    serverApi.resolveRouteHandlerDeps<CompatibilityCheckDeps>(depsOrContext),
  );

  const authResult = await deps.requireMutableAuthenticatedUserFn(request, {
    rateLimit: {
      key: "proxy-compatibility-check",
      maxAttempts: deps.rateLimitConfig.maxAttempts,
      scope: "user",
      windowMs: deps.rateLimitConfig.windowMs,
    },
  });
  if (authResult instanceof Response) return authResult;

  const body = await deps.parseJsonBodyOrResponseFn(request);
  if (body instanceof Response) return body;

  const executionContext = await resolveCompatibilityExecutionContext(
    authResult.userId,
    body.useProxy ?? false,
    deps,
  );
  if (executionContext instanceof Response) {
    return executionContext;
  }

  executionContext.loggerInstance.info(
    "Connection compatibility check started",
    {
      proxyConfigured: !!executionContext.proxyUrl,
      sites: COMPATIBILITY_CHECK_SITES.map((site) => site.label),
      useProxy: executionContext.useProxy,
      userId: executionContext.userId,
    },
  );

  const results = await runCompatibilityChecks(executionContext, deps);

  return NextResponse.json({ results });
}

/**
 * Build the failed compatibility check result.
 * @param result - The result.
 * @param site - The site.
 * @param error - The error.
 * @param executionContext - The execution context.
 * @param deps - The deps.
 * @returns The failed compatibility check result.
 */
function buildFailedCompatibilityCheckResult(
  result: CompatibilityCheckResult,
  site: (typeof COMPATIBILITY_CHECK_SITES)[number],
  error: unknown,
  executionContext: CompatibilityCheckExecutionContext,
  deps: ResolvedCompatibilityCheckDeps,
): CompatibilityCheckResult {
  result.success = false;
  result.compatibilitySignalDetected = true;

  if (error instanceof deps.httpCloakUpstreamErrorClass) {
    result.statusCode = error.statusCode;
    result.error = `HTTP ${error.statusCode}`;
    result.compatibilitySignalDetected = hasCompatibilitySignal(
      site.vendor,
      error.responseBody.toLowerCase(),
    );

    executionContext.loggerInstance.error(
      "Connection compatibility check failed with upstream response",
      {
        compatibilitySignalDetected: result.compatibilitySignalDetected,
        proxyMode: error.proxyMode,
        requestHeaders: deps.pickDiagnosticHeadersFn(error.requestHeaders),
        responseHeaders: deps.pickDiagnosticHeadersFn(error.responseHeaders),
        responseSnippet: error.responseBody.slice(0, 500),
        site: site.label,
        statusCode: error.statusCode,
        url: site.url,
        useProxy: executionContext.useProxy,
        vendor: site.vendor,
      },
    );

    return result;
  }

  result.error = error instanceof Error ? error.message : "Request failed";
  executionContext.loggerInstance.error(
    "Connection compatibility check failed",
    {
      error: result.error,
      site: site.label,
      url: site.url,
      useProxy: executionContext.useProxy,
      vendor: site.vendor,
    },
  );
  return result;
}

/**
 * Build the successful compatibility check result.
 * @param result - The result.
 * @param site - The site.
 * @param html - The html.
 * @param requestHeaders - The request headers.
 * @param executionContext - The execution context.
 * @param deps - The deps.
 * @returns The successful compatibility check result.
 */
function buildSuccessfulCompatibilityCheckResult(
  result: CompatibilityCheckResult,
  site: (typeof COMPATIBILITY_CHECK_SITES)[number],
  html: string,
  requestHeaders: Record<string, string | string[] | undefined>,
  executionContext: CompatibilityCheckExecutionContext,
  deps: ResolvedCompatibilityCheckDeps,
): CompatibilityCheckResult {
  result.success = true;
  result.statusCode = 200;
  result.responseSize = Buffer.byteLength(html, "utf-8");
  result.compatibilitySignalDetected = hasCompatibilitySignal(
    site.vendor,
    html.toLowerCase(),
  );

  executionContext.loggerInstance.info(
    "Connection compatibility check completed",
    {
      compatibilitySignalDetected: result.compatibilitySignalDetected,
      htmlSnippet: html.slice(0, 500),
      requestHeaders: deps.pickDiagnosticHeadersFn(requestHeaders),
      responseSize: result.responseSize,
      site: site.label,
      statusCode: 200,
      success: true,
      url: site.url,
      useProxy: executionContext.useProxy,
      vendor: site.vendor,
    },
  );

  return result;
}

/**
 * Return whether has compatibility signal.
 * @param vendor - The vendor.
 * @param bodyLower - The body lower.
 * @returns Whether has compatibility signal.
 */
function hasCompatibilitySignal(vendor: string, bodyLower: string) {
  const signals = COMPATIBILITY_SIGNAL_BY_VENDOR[vendor];

  return signals ? signals.some((signal) => bodyLower.includes(signal)) : false;
}

/**
 * Normalize the resolved user proxy.
 * @param value - The value.
 * @returns The resolved user proxy.
 */
function normalizeResolvedUserProxy(value: unknown): ResolvedUserProxyConfig {
  if (!value || typeof value !== "object") {
    return { allowInsecureTls: false };
  }

  const candidate = value as {
    allowInsecureTls?: unknown;
    proxyUrl?: unknown;
  };

  return {
    allowInsecureTls: candidate.allowInsecureTls === true,
    proxyUrl:
      typeof candidate.proxyUrl === "string" && candidate.proxyUrl.length > 0
        ? candidate.proxyUrl
        : undefined,
  };
}

/**
 * Parse the compatibility check body.
 * @param request - The request.
 * @returns The compatibility check body.
 */
async function parseCompatibilityCheckBody(
  request: NextRequest,
): Promise<CompatibilityCheckRequest | Response> {
  try {
    const body = (await request.json()) as unknown;
    if (body === null || Array.isArray(body) || typeof body !== "object") {
      return NextResponse.json(
        { error: "JSON body must be an object" },
        { status: 400 },
      );
    }
    return body as CompatibilityCheckRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}

/**
 * Resolve the compatibility check deps.
 * @param deps - The deps.
 * @returns The compatibility check deps.
 */
function resolveCompatibilityCheckDeps(
  deps: CompatibilityCheckDeps,
): ResolvedCompatibilityCheckDeps {
  return {
    fetchHtmlWithHttpCloakFn:
      deps.fetchHtmlWithHttpCloakFn ?? fetchHtmlWithHttpCloak,
    httpCloakUpstreamErrorClass:
      deps.httpCloakUpstreamErrorClass ?? HttpCloakUpstreamError,
    loggerInstance: deps.loggerInstance ?? logger,
    parseJsonBodyOrResponseFn:
      deps.parseJsonBodyOrResponseFn ?? parseCompatibilityCheckBody,
    pickDiagnosticHeadersFn:
      deps.pickDiagnosticHeadersFn ?? pickDiagnosticHeaders,
    rateLimitConfig: deps.rateLimitConfig ?? {
      maxAttempts: CONFIG.RATE_LIMIT_PROXY_COMPATIBILITY_MAX_ATTEMPTS,
      windowMs: CONFIG.RATE_LIMIT_PROXY_COMPATIBILITY_WINDOW_MS,
    },
    requireMutableAuthenticatedUserFn:
      deps.requireMutableAuthenticatedUserFn ??
      serverApi.requireMutableAuthenticatedUser,
    resolveUserProxyFn: deps.resolveUserProxyFn ?? resolveUserProxy,
    serviceErrorClass: deps.serviceErrorClass ?? serverApi.ServerServiceError,
  };
}

/**
 * Resolve the compatibility execution context.
 * @param userId - The user ID.
 * @param useProxy - The proxy.
 * @param deps - The deps.
 * @returns The compatibility execution context.
 */
async function resolveCompatibilityExecutionContext(
  userId: number,
  useProxy: boolean,
  deps: ResolvedCompatibilityCheckDeps,
): Promise<CompatibilityCheckExecutionContext | Response> {
  if (!useProxy) {
    return {
      allowInsecureTls: false,
      loggerInstance: deps.loggerInstance,
      useProxy,
      userId,
    };
  }

  try {
    const resolved = normalizeResolvedUserProxy(
      await deps.resolveUserProxyFn(userId),
    );
    const proxyUrl = resolved.proxyUrl;
    if (!proxyUrl) {
      return NextResponse.json(
        { error: "No proxy configured. Configure a proxy first." },
        { status: 400 },
      );
    }

    const allowInsecureTls = resolved.allowInsecureTls;

    return {
      allowInsecureTls,
      loggerInstance: deps.loggerInstance,
      proxyUrl,
      useProxy,
      userId,
    };
  } catch (error) {
    if (
      error instanceof deps.serviceErrorClass &&
      error.reason === "proxy-password-unreadable"
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    throw error;
  }
}

/**
 * Process the run compatibility check.
 * @param site - The site.
 * @param executionContext - The execution context.
 * @param deps - The deps.
 * @returns The run compatibility check.
 */
async function runCompatibilityCheck(
  site: (typeof COMPATIBILITY_CHECK_SITES)[number],
  executionContext: CompatibilityCheckExecutionContext,
  deps: ResolvedCompatibilityCheckDeps,
): Promise<CompatibilityCheckResult> {
  const result: CompatibilityCheckResult = {
    compatibilitySignalDetected: false,
    site: site.label,
    success: false,
    url: site.url,
    vendor: site.vendor,
  };

  try {
    const { html, requestHeaders } = await deps.fetchHtmlWithHttpCloakFn(
      site.url,
      () => Promise.resolve(true),
      {
        allowInsecureTls: executionContext.allowInsecureTls,
        proxyUrl: executionContext.proxyUrl,
      },
    );

    return buildSuccessfulCompatibilityCheckResult(
      result,
      site,
      html,
      requestHeaders,
      executionContext,
      deps,
    );
  } catch (error) {
    return buildFailedCompatibilityCheckResult(
      result,
      site,
      error,
      executionContext,
      deps,
    );
  }
}

/**
 * Process the run compatibility checks.
 * @param executionContext - The execution context.
 * @param deps - The deps.
 * @returns The run compatibility checks.
 */
async function runCompatibilityChecks(
  executionContext: CompatibilityCheckExecutionContext,
  deps: ResolvedCompatibilityCheckDeps,
): Promise<CompatibilityCheckResult[]> {
  return Promise.all(
    COMPATIBILITY_CHECK_SITES.map((site) =>
      runCompatibilityCheck(site, executionContext, deps),
    ),
  );
}

const COMPATIBILITY_SIGNAL_BY_VENDOR: Partial<Record<string, string[]>> = {
  Cloudflare: [
    "cloudflare",
    "cf-browser-verification",
    "__cf_chl_",
    "/cdn-cgi/challenge-platform",
  ],
  DataDome: ["datadome", "captcha-delivery", "geo.captcha-delivery"],
  PerimeterX: ["perimeterx", "_px", "px-captcha"],
  reCAPTCHA: [
    "g-recaptcha",
    "grecaptcha",
    "/recaptcha/api",
    "google.com/recaptcha",
    "i'm not a robot",
  ],
};
