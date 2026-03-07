import { CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";
import { stripUrlFragment } from "@/lib/utils/url";
import axios from "axios";
import { wrapper as cookieJarWrapper } from "axios-cookiejar-support";
import type { CookieJar } from "tough-cookie";
import { TLS_CLIENT_CHROME_VER } from "./constants";
import {
  addCookiesToHeaders,
  generateBrowserHeaders,
  storeCookiesFromResponse,
} from "./cookies";
import { GotScrapingError, pickDiagnosticHeaders } from "./response";
import { ensureTlsClient, tlsClientFetch } from "./tls-client";

export const extractionAxios = cookieJarWrapper(axios.create());

interface FingerprintFetchOptions {
  proxyUrl?: string;
  allowInsecureTls?: boolean;
  browserVersion?: number;
  secChUa?: string;
  cookieJar?: CookieJar;
  accept?: string;
  referer?: string;
}

interface FingerprintFetchDeps {
  requestFn?: (
    url: URL,
    headers: Record<string, string>,
  ) => Promise<{
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>;
}

export async function fetchHtmlWithFingerprint(
  url: string,
  isAllowedUrl: (candidateUrl: string) => Promise<boolean>,
  options?: FingerprintFetchOptions,
  deps?: FingerprintFetchDeps,
): Promise<{
  html: string;
  requestHeaders: Record<string, string | string[] | undefined>;
}> {
  let currentUrl = stripUrlFragment(url);
  let isFirstValidation = true;

  const proxyMode = options?.proxyUrl ? "proxy" : "direct";
  const allowInsecureTls = options?.allowInsecureTls ?? false;
  const timeoutMs = 25_000;

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    if (!(await isAllowedUrl(currentUrl))) {
      throw new Error(
        isFirstValidation ? "Blocked URL" : "Blocked redirect target",
      );
    }
    isFirstValidation = false;

    const parsed = new URL(currentUrl);
    const headers = generateBrowserHeaders("2", {
      accept: options?.accept,
      referer: options?.referer,
      secChUa: options?.secChUa,
    });

    addCookiesToHeaders(headers, options?.cookieJar, currentUrl);

    logger.info("Fingerprint fetch attempt (Chrome 131 uTLS)", {
      url: currentUrl,
      proxyMode,
      proxyUrl: options?.proxyUrl,
      redirectHop: redirects,
    });

    let response: {
      statusCode: number;
      headers: Record<string, string | string[] | undefined>;
      body: string;
    };

    if (deps?.requestFn) {
      response = await deps.requestFn(parsed, headers);
    } else {
      if (!(await ensureTlsClient())) {
        throw new Error(
          "node-tls-client initialization failed — cannot proceed without Chrome 131 uTLS fingerprint",
        );
      }

      response = await tlsClientFetch(
        parsed,
        headers,
        options?.proxyUrl,
        allowInsecureTls,
        timeoutMs,
      );

      if (response.statusCode === 0) {
        throw new Error(
          `Network failure: ${response.body || "Connection failed (statusCode 0)"}`,
        );
      }
    }

    logger.info("Fingerprint fetch response", {
      url: currentUrl,
      statusCode: response.statusCode,
      proxyMode,
      redirectHop: redirects,
      diagnosticHeaders: pickDiagnosticHeaders(response.headers),
    });

    storeCookiesFromResponse(options?.cookieJar, response.headers, currentUrl);

    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (redirects === 5) throw new Error("Too many redirects");
      const location = Array.isArray(response.headers.location)
        ? response.headers.location[0]
        : response.headers.location;
      if (typeof location !== "string" || !location.trim())
        throw new Error("Redirect without Location header");
      currentUrl = stripUrlFragment(new URL(location, currentUrl).toString());
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new GotScrapingError(
        response.statusCode,
        response.body,
        proxyMode,
        options?.proxyUrl ?? null,
        TLS_CLIENT_CHROME_VER,
        allowInsecureTls,
        redirects,
        response.headers,
        headers as Record<string, string | string[] | undefined>,
      );
    }

    if (
      Buffer.byteLength(response.body, "utf8") >
      CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES
    )
      throw new Error("Upstream response too large");

    return {
      html: response.body,
      requestHeaders: headers as Record<string, string | string[] | undefined>,
    };
  }

  throw new Error("Too many redirects");
}
