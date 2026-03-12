import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { parseJsonBodyOrResponse } from "@/lib/api/http";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import {
  fetchHtmlWithFingerprint,
  GotScrapingError,
  pickDiagnosticHeaders,
} from "@/lib/fetch";
import { logger } from "@/lib/logger";
import { requireAuthenticatedUser } from "@/lib/server";
import { injectProxyCredentials } from "@/lib/utils/url";

export const dynamic = "force-dynamic";

// Test real anti-bot protections: DataDome, PerimeterX, Cloudflare, reCAPTCHA
const TEST_SITES = [
  {
    name: "x (DataDome)",
    protection: "DataDome",
    url: "https://www.pennlive.com/",
  },
  {
    name: "x (PerimeterX)",
    protection: "PerimeterX",
    url: "https://www.abc27.com/",
  },
  {
    name: "Cloudflare",
    protection: "Cloudflare",
    url: "https://www.cloudflare.com/",
  },
  {
    name: "Google reCAPTCHA Demo",
    protection: "reCAPTCHA",
    url: "https://ticketmaster.com/",
  },
] as const;

interface SiteTestResult {
  blocked: boolean;
  error?: string;
  protection: string;
  responseSize?: number;
  site: string;
  statusCode?: number;
  success: boolean;
  url: string;
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof Response) return authResult;

  const body = await parseJsonBodyOrResponse<{
    useProxy?: boolean;
  }>(request);
  if (body instanceof Response) return body;

  const useProxy = body.useProxy ?? false;

  // Get user's proxy settings if proxy is requested
  let proxyUrl: string | undefined;
  let allowInsecureTls = false;

  if (useProxy) {
    const db = getDb();
    const [user] = await db
      .select({
        allowInsecureTls: users.allowInsecureTls,
        proxyPassword: users.proxyPassword,
        proxyUrl: users.proxyUrl,
        proxyUsername: users.proxyUsername,
      })
      .from(users)
      .where(eq(users.id, authResult.userId))
      .limit(1);

    const rawProxyUrl = user?.proxyUrl?.trim();
    const baseProxyUrl =
      rawProxyUrl && rawProxyUrl !== "null" && rawProxyUrl !== "undefined"
        ? rawProxyUrl
        : undefined;
    proxyUrl =
      baseProxyUrl && user?.proxyUsername && user?.proxyPassword
        ? injectProxyCredentials(
            baseProxyUrl,
            user.proxyUsername,
            user.proxyPassword,
          )
        : baseProxyUrl;
    allowInsecureTls = user?.allowInsecureTls ?? false;

    if (!proxyUrl) {
      return NextResponse.json(
        { error: "No proxy configured. Configure a proxy first." },
        { status: 400 },
      );
    }
  }

  logger.info("Anti-bot protection test started", {
    proxyConfigured: !!proxyUrl,
    sites: TEST_SITES.map((s) => s.name),
    useProxy,
    userId: authResult.userId,
  });

  const testSite = async (
    site: (typeof TEST_SITES)[number],
  ): Promise<SiteTestResult> => {
    const result: SiteTestResult = {
      blocked: false,
      protection: site.protection,
      site: site.name,
      success: false,
      url: site.url,
    };

    try {
      const { html, requestHeaders } = await fetchHtmlWithFingerprint(
        site.url,
        async () => true,
        {
          allowInsecureTls,
          proxyUrl,
        },
      );

      result.success = true;
      result.statusCode = 200;
      result.responseSize = Buffer.byteLength(html, "utf-8");

      const htmlLower = html.toLowerCase();

      // Check if blocked by anti-bot protection signal
      result.blocked = hasProtectionSignal(site.protection, htmlLower);

      logger.info("Site test completed", {
        blocked: result.blocked,
        htmlSnippet: html.slice(0, 500),
        protection: site.protection,
        requestHeaders: pickDiagnosticHeaders(requestHeaders),
        responseSize: result.responseSize,
        site: site.name,
        statusCode: 200,
        success: true,
        url: site.url,
        useProxy,
      });
    } catch (err) {
      result.success = false;
      result.blocked = true;

      if (err instanceof GotScrapingError) {
        result.statusCode = err.statusCode;
        result.error = `HTTP ${err.statusCode}`;

        const bodyLower = err.responseBody.toLowerCase();
        result.blocked = hasProtectionSignal(site.protection, bodyLower);

        logger.error("Site test failed with upstream error", {
          blocked: result.blocked,
          protection: site.protection,
          proxyMode: err.proxyMode,
          requestHeaders: pickDiagnosticHeaders(err.requestHeaders),
          responseHeaders: pickDiagnosticHeaders(err.responseHeaders),
          responseSnippet: err.responseBody.slice(0, 500),
          site: site.name,
          statusCode: err.statusCode,
          url: site.url,
          useProxy,
        });
      } else {
        result.error = err instanceof Error ? err.message : "Request failed";
        logger.error("Site test failed", {
          error: result.error,
          protection: site.protection,
          site: site.name,
          url: site.url,
          useProxy,
        });
      }
    }

    return result;
  };

  // Run each provider test concurrently.
  const results = await Promise.all(TEST_SITES.map((site) => testSite(site)));

  return NextResponse.json({ results });
}

function hasProtectionSignal(protection: string, bodyLower: string) {
  if (protection === "DataDome")
    return (
      bodyLower.includes("datadome") ||
      bodyLower.includes("captcha-delivery") ||
      bodyLower.includes("geo.captcha-delivery")
    );
  if (protection === "PerimeterX")
    return (
      bodyLower.includes("perimeterx") ||
      bodyLower.includes("_px") ||
      bodyLower.includes("px-captcha")
    );
  if (protection === "Cloudflare")
    return (
      bodyLower.includes("cloudflare") ||
      bodyLower.includes("cf-browser-verification") ||
      bodyLower.includes("__cf_chl_") ||
      bodyLower.includes("/cdn-cgi/challenge-platform")
    );
  if (protection === "reCAPTCHA")
    return (
      bodyLower.includes("g-recaptcha") ||
      bodyLower.includes("grecaptcha") ||
      bodyLower.includes("/recaptcha/api") ||
      bodyLower.includes("google.com/recaptcha") ||
      bodyLower.includes("i'm not a robot")
    );
  return false;
}
