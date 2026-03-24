import { NextRequest, NextResponse } from "next/server";

import { parseJsonBodyOrResponse } from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import {
  fetchHtmlWithFingerprint,
  GotScrapingError,
  pickDiagnosticHeaders,
} from "@/lib/fetch";
import { logger } from "@/lib/logger";
import {
  requireMutableAuthenticatedUser,
  resolveRouteHandlerDeps,
  type RouteHandlerContext,
} from "@/lib/server";
import { resolveUserProxy, ServiceError } from "@/lib/server/services";

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

interface CompatibilityCheckDeps {
  fetchHtmlWithFingerprintFn?: typeof fetchHtmlWithFingerprint;
  gotScrapingErrorClass?: typeof GotScrapingError;
  loggerInstance?: typeof logger;
  parseJsonBodyOrResponseFn?: typeof parseJsonBodyOrResponse;
  pickDiagnosticHeadersFn?: typeof pickDiagnosticHeaders;
  rateLimitConfig?: {
    maxAttempts: number;
    windowMs: number;
  };
  requireMutableAuthenticatedUserFn?: typeof requireMutableAuthenticatedUser;
  resolveUserProxyFn?: typeof resolveUserProxy;
  serviceErrorClass?: typeof ServiceError;
}

interface CompatibilityCheckRequest {
  useProxy?: boolean;
}

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
 * Runs vendor-sample compatibility checks for the authenticated user's current
 * network path and optional proxy settings.
 */
export async function POST(
  request: NextRequest,
  depsOrContext: CompatibilityCheckDeps | RouteHandlerContext = {},
) {
  const deps = resolveRouteHandlerDeps<CompatibilityCheckDeps>(depsOrContext);
  const parseJsonBodyOrResponseFn =
    deps.parseJsonBodyOrResponseFn ?? parseJsonBodyOrResponse;
  const requireMutableAuthenticatedUserFn =
    deps.requireMutableAuthenticatedUserFn ?? requireMutableAuthenticatedUser;
  const resolveUserProxyFn = deps.resolveUserProxyFn ?? resolveUserProxy;
  const fetchHtmlWithFingerprintFn =
    deps.fetchHtmlWithFingerprintFn ?? fetchHtmlWithFingerprint;
  const pickDiagnosticHeadersFn =
    deps.pickDiagnosticHeadersFn ?? pickDiagnosticHeaders;
  const loggerInstance = deps.loggerInstance ?? logger;
  const GotScrapingErrorClass =
    deps.gotScrapingErrorClass ?? GotScrapingError;
  const ServiceErrorClass = deps.serviceErrorClass ?? ServiceError;
  const rateLimitConfig = deps.rateLimitConfig ?? {
    maxAttempts: CONFIG.RATE_LIMIT_PROXY_COMPATIBILITY_MAX_ATTEMPTS,
    windowMs: CONFIG.RATE_LIMIT_PROXY_COMPATIBILITY_WINDOW_MS,
  };

  const authResult = await requireMutableAuthenticatedUserFn(request, {
    rateLimit: {
      key: "proxy-compatibility-check",
      maxAttempts: rateLimitConfig.maxAttempts,
      scope: "user",
      windowMs: rateLimitConfig.windowMs,
    },
  });
  if (authResult instanceof Response) return authResult;

  const body = await parseJsonBodyOrResponseFn<CompatibilityCheckRequest>(request);
  if (body instanceof Response) return body;

  const useProxy = body.useProxy ?? false;

  let proxyUrl: string | undefined;
  let allowInsecureTls = false;

  if (useProxy) {
    try {
      const resolved = await resolveUserProxyFn(authResult.userId);
      proxyUrl = resolved.proxyUrl;
      allowInsecureTls = resolved.allowInsecureTls;
    } catch (error) {
      if (
        error instanceof ServiceErrorClass &&
        error.reason === "proxy-password-unreadable"
      ) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    if (!proxyUrl) {
      return NextResponse.json(
        { error: "No proxy configured. Configure a proxy first." },
        { status: 400 },
      );
    }
  }

  loggerInstance.info("Connection compatibility check started", {
    proxyConfigured: !!proxyUrl,
    sites: COMPATIBILITY_CHECK_SITES.map((site) => site.label),
    useProxy,
    userId: authResult.userId,
  });

  const runCompatibilityCheck = (
    site: (typeof COMPATIBILITY_CHECK_SITES)[number],
  ): Promise<CompatibilityCheckResult> => {
    return (async () => {
      const result: CompatibilityCheckResult = {
        compatibilitySignalDetected: false,
        site: site.label,
        success: false,
        url: site.url,
        vendor: site.vendor,
      };

      try {
        const { html, requestHeaders } = await fetchHtmlWithFingerprintFn(
          site.url,
          () => Promise.resolve(true),
          {
            allowInsecureTls,
            proxyUrl,
          },
        );

        result.success = true;
        result.statusCode = 200;
        result.responseSize = Buffer.byteLength(html, "utf-8");

        result.compatibilitySignalDetected = hasCompatibilitySignal(
          site.vendor,
          html.toLowerCase(),
        );

        loggerInstance.info("Connection compatibility check completed", {
          compatibilitySignalDetected: result.compatibilitySignalDetected,
          htmlSnippet: html.slice(0, 500),
          requestHeaders: pickDiagnosticHeadersFn(requestHeaders),
          responseSize: result.responseSize,
          site: site.label,
          statusCode: 200,
          success: true,
          url: site.url,
          useProxy,
          vendor: site.vendor,
        });
      } catch (err) {
        result.success = false;
        result.compatibilitySignalDetected = true;

        if (err instanceof GotScrapingErrorClass) {
          result.statusCode = err.statusCode;
          result.error = `HTTP ${err.statusCode}`;
          result.compatibilitySignalDetected = hasCompatibilitySignal(
            site.vendor,
            err.responseBody.toLowerCase(),
          );

          loggerInstance.error(
            "Connection compatibility check failed with upstream response",
            {
              compatibilitySignalDetected:
                result.compatibilitySignalDetected,
              proxyMode: err.proxyMode,
              requestHeaders: pickDiagnosticHeadersFn(err.requestHeaders),
              responseHeaders: pickDiagnosticHeadersFn(err.responseHeaders),
              responseSnippet: err.responseBody.slice(0, 500),
              site: site.label,
              statusCode: err.statusCode,
              url: site.url,
              useProxy,
              vendor: site.vendor,
            },
          );
        } else {
          result.error = err instanceof Error ? err.message : "Request failed";
          loggerInstance.error("Connection compatibility check failed", {
            error: result.error,
            site: site.label,
            url: site.url,
            useProxy,
            vendor: site.vendor,
          });
        }
      }

      return result;
    })();
  };

  const results = await Promise.all(
    COMPATIBILITY_CHECK_SITES.map((site) => runCompatibilityCheck(site)),
  );

  return NextResponse.json({ results });
}

function hasCompatibilitySignal(vendor: string, bodyLower: string) {
  if (vendor === "DataDome") {
    return (
      bodyLower.includes("datadome") ||
      bodyLower.includes("captcha-delivery") ||
      bodyLower.includes("geo.captcha-delivery")
    );
  }

  if (vendor === "PerimeterX") {
    return (
      bodyLower.includes("perimeterx") ||
      bodyLower.includes("_px") ||
      bodyLower.includes("px-captcha")
    );
  }

  if (vendor === "Cloudflare") {
    return (
      bodyLower.includes("cloudflare") ||
      bodyLower.includes("cf-browser-verification") ||
      bodyLower.includes("__cf_chl_") ||
      bodyLower.includes("/cdn-cgi/challenge-platform")
    );
  }

  if (vendor === "reCAPTCHA") {
    return (
      bodyLower.includes("g-recaptcha") ||
      bodyLower.includes("grecaptcha") ||
      bodyLower.includes("/recaptcha/api") ||
      bodyLower.includes("google.com/recaptcha") ||
      bodyLower.includes("i'm not a robot")
    );
  }

  return false;
}