import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { parseJsonBodyOrResponse } from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import {
  fetchHtmlWithFingerprint,
  GotScrapingError,
  pickDiagnosticHeaders,
} from "@/lib/fetch";
import { logger } from "@/lib/logger";
import {
  materializeStoredProxyPassword,
  requireMutableAuthenticatedUser,
} from "@/lib/server";
import { getUrlCredentials, injectProxyCredentials } from "@/lib/utils/url";

export const dynamic = "force-dynamic";

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
export async function POST(request: NextRequest) {
  const authResult = await requireMutableAuthenticatedUser(request, {
    rateLimit: {
      key: "proxy-compatibility-check",
      maxAttempts: CONFIG.RATE_LIMIT_PROXY_COMPATIBILITY_MAX_ATTEMPTS,
      scope: "user",
      windowMs: CONFIG.RATE_LIMIT_PROXY_COMPATIBILITY_WINDOW_MS,
    },
  });
  if (authResult instanceof Response) return authResult;

  const body = await parseJsonBodyOrResponse<CompatibilityCheckRequest>(request);
  if (body instanceof Response) return body;

  const useProxy = body.useProxy ?? false;

  let proxyUrl: string | undefined;
  let allowInsecureTls = false;

  if (useProxy) {
    const db = getDb();
    const usersWithProxy = await db
      .select({
        allowInsecureTls: users.allowInsecureTls,
        proxyPassword: users.proxyPassword,
        proxyUrl: users.proxyUrl,
        proxyUsername: users.proxyUsername,
      })
      .from(users)
      .where(eq(users.id, authResult.userId))
      .limit(1);

    const user = usersWithProxy.length === 0 ? null : usersWithProxy[0];
    const rawProxyUrl = user?.proxyUrl?.trim();
    const embeddedCredentials = rawProxyUrl
      ? getUrlCredentials(rawProxyUrl)
      : null;
    const baseProxyUrl =
      rawProxyUrl !== undefined &&
      rawProxyUrl !== "" &&
      rawProxyUrl !== "null" &&
      rawProxyUrl !== "undefined"
        ? embeddedCredentials?.sanitizedUrl ?? rawProxyUrl
        : undefined;
    let decryptedProxyPassword: null | string = null;

    if (user !== null) {
      try {
        decryptedProxyPassword = await materializeStoredProxyPassword(
          user.proxyPassword,
          async (normalizedStoredPassword) => {
            await db
              .update(users)
              .set({ proxyPassword: normalizedStoredPassword })
              .where(eq(users.id, authResult.userId));
          },
        );
      } catch (error) {
        logger.error("Saved proxy password could not be materialized", {
          error: error instanceof Error ? error.message : String(error),
          userId: authResult.userId,
        });
        return NextResponse.json(
          {
            error:
              "Saved proxy password could not be read. Update it in settings and try again.",
          },
          { status: 500 },
        );
      }
    }

    proxyUrl =
      baseProxyUrl !== undefined &&
      (user?.proxyUsername ?? embeddedCredentials?.username) !== null &&
      (decryptedProxyPassword ?? embeddedCredentials?.password) !== null
        ? injectProxyCredentials(
            baseProxyUrl,
            user?.proxyUsername ?? embeddedCredentials?.username ?? "",
            decryptedProxyPassword ?? embeddedCredentials?.password ?? "",
          )
        : baseProxyUrl;
    allowInsecureTls = user === null ? false : user.allowInsecureTls;

    if (!proxyUrl) {
      return NextResponse.json(
        { error: "No proxy configured. Configure a proxy first." },
        { status: 400 },
      );
    }
  }

  logger.info("Connection compatibility check started", {
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
        const { html, requestHeaders } = await fetchHtmlWithFingerprint(
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

        logger.info("Connection compatibility check completed", {
          compatibilitySignalDetected: result.compatibilitySignalDetected,
          htmlSnippet: html.slice(0, 500),
          requestHeaders: pickDiagnosticHeaders(requestHeaders),
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

        if (err instanceof GotScrapingError) {
          result.statusCode = err.statusCode;
          result.error = `HTTP ${err.statusCode}`;
          result.compatibilitySignalDetected = hasCompatibilitySignal(
            site.vendor,
            err.responseBody.toLowerCase(),
          );

          logger.error(
            "Connection compatibility check failed with upstream response",
            {
              compatibilitySignalDetected:
                result.compatibilitySignalDetected,
              proxyMode: err.proxyMode,
              requestHeaders: pickDiagnosticHeaders(err.requestHeaders),
              responseHeaders: pickDiagnosticHeaders(err.responseHeaders),
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
          logger.error("Connection compatibility check failed", {
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