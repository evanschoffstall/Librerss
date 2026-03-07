import { parseJsonBodyOrResponse } from "@/lib/api/http";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import {
  fetchHtmlWithFingerprint,
  GotScrapingError,
  pickDiagnosticHeaders,
} from "@/lib/extract/fingerprint-fetch";
import { logger } from "@/lib/logger";
import { requireAuthenticatedUser } from "@/lib/server";
import { injectProxyCredentials } from "@/lib/utils/url";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Test real anti-bot protections: DataDome (Nike) and PerimeterX (Lowes)
const TEST_SITES = [
  {
    name: "Nike (DataDome)",
    url: "https://www.nike.com",
    protection: "DataDome",
  },
  {
    name: "Lowes (PerimeterX)",
    url: "https://www.lowes.com",
    protection: "PerimeterX",
  },
] as const;

type SiteTestResult = {
  site: string;
  url: string;
  protection: string;
  success: boolean;
  statusCode?: number;
  blocked: boolean;
  error?: string;
  responseSize?: number;
};

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
        proxyUrl: users.proxyUrl,
        allowInsecureTls: users.allowInsecureTls,
        proxyUsername: users.proxyUsername,
        proxyPassword: users.proxyPassword,
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
    sites: TEST_SITES.map((s) => s.name),
    useProxy,
    proxyConfigured: !!proxyUrl,
    userId: authResult.userId,
  });

  const results: SiteTestResult[] = [];

  // Test each site sequentially
  for (const site of TEST_SITES) {
    const result: SiteTestResult = {
      site: site.name,
      url: site.url,
      protection: site.protection,
      success: false,
      blocked: false,
    };

    try {
      const { html, requestHeaders } = await fetchHtmlWithFingerprint(
        site.url,
        async () => true,
        {
          proxyUrl,
          allowInsecureTls,
          browserVersion: 131,
          operatingSystem: "windows",
        },
      );

      result.success = true;
      result.statusCode = 200;
      result.responseSize = Buffer.byteLength(html, "utf-8");

      const htmlLower = html.toLowerCase();

      // Check if blocked by anti-bot protection
      if (site.protection === "DataDome") {
        result.blocked =
          htmlLower.includes("datadome") ||
          htmlLower.includes("captcha-delivery") ||
          htmlLower.includes("geo.captcha-delivery");
      } else if (site.protection === "PerimeterX") {
        result.blocked =
          htmlLower.includes("perimeterx") ||
          htmlLower.includes("_px") ||
          htmlLower.includes("px-captcha");
      }

      logger.info("Site test completed", {
        site: site.name,
        url: site.url,
        protection: site.protection,
        success: true,
        blocked: result.blocked,
        statusCode: 200,
        responseSize: result.responseSize,
        useProxy,
        requestHeaders: pickDiagnosticHeaders(requestHeaders),
        htmlSnippet: html.slice(0, 500),
      });
    } catch (err) {
      result.success = false;
      result.blocked = true;

      if (err instanceof GotScrapingError) {
        result.statusCode = err.statusCode;
        result.error = `HTTP ${err.statusCode}`;

        const bodyLower = err.responseBody.toLowerCase();
        if (site.protection === "DataDome" && bodyLower.includes("datadome")) {
          result.blocked = true;
        } else if (
          site.protection === "PerimeterX" &&
          (bodyLower.includes("perimeterx") || bodyLower.includes("_px"))
        ) {
          result.blocked = true;
        }

        logger.error("Site test failed with upstream error", {
          site: site.name,
          url: site.url,
          protection: site.protection,
          statusCode: err.statusCode,
          blocked: result.blocked,
          useProxy,
          proxyMode: err.proxyMode,
          requestHeaders: pickDiagnosticHeaders(err.requestHeaders),
          responseHeaders: pickDiagnosticHeaders(err.responseHeaders),
          responseSnippet: err.responseBody.slice(0, 500),
        });
      } else {
        result.error = err instanceof Error ? err.message : "Request failed";
        logger.error("Site test failed", {
          site: site.name,
          url: site.url,
          protection: site.protection,
          error: result.error,
          useProxy,
        });
      }
    }

    results.push(result);
  }

  return NextResponse.json({ results });
}
