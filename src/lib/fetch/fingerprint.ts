import type { CookieJar } from "tough-cookie";

import axios from "axios";
import { wrapper as cookieJarWrapper } from "axios-cookiejar-support";

import { CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";
import { decodeTextBody } from "@/lib/utils/content-encoding";
import { stripUrlFragment } from "@/lib/utils/url";

import { TLS_CLIENT_CHROME_VER } from "./constants";
import {
  addCookiesToHeaders,
  generateBrowserHeaders,
  storeCookiesFromResponse,
} from "./cookies";
import {
  GotScrapingError,
  pickDiagnosticHeaders,
} from "./response";
import { ensureTlsClient, tlsClientFetch } from "./tls-client";

export const extractionAxios = cookieJarWrapper(axios.create());

interface FingerprintFetchDeps {
  requestFn?: (
    url: URL,
    headers: Record<string, string>,
  ) => Promise<{
    body: string;
    headers: Record<string, string | string[] | undefined>;
    statusCode: number;
  }>;
}

interface FingerprintFetchOptions {
  accept?: string;
  allowInsecureTls?: boolean;
  browserVersion?: number;
  cookieJar?: CookieJar;
  proxyUrl?: string;
  referer?: string;
  secChUa?: string;
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
      proxyMode,
      proxyUrl: options?.proxyUrl,
      redirectHop: redirects,
      url: currentUrl,
    });

    let response: {
      body: string;
      headers: Record<string, string | string[] | undefined>;
      statusCode: number;
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
      diagnosticHeaders: pickDiagnosticHeaders(response.headers),
      proxyMode,
      redirectHop: redirects,
      statusCode: response.statusCode,
      url: currentUrl,
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

    const decodedBody = await resolveResponseBody(response);

    if (
      Buffer.byteLength(decodedBody, "utf8") >
      CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES
    ) {
      throw new Error("Upstream response too large");
    }

    return {
      html: decodedBody,
      requestHeaders: headers as Record<string, string | string[] | undefined>,
    };
  }

  throw new Error("Too many redirects");
}

function getSingleHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  headerName: string,
): string | undefined {
  const match = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === headerName,
  )?.[1];

  return Array.isArray(match) ? match[0] : match;
}

/**
 * TLS client responses can preserve content-encoding while exposing the raw
 * payload as a binary-like string. Decode those bodies before distillation so
 * downstream extraction always receives HTML instead of compressed bytes.
 */
async function resolveResponseBody(
  response: {
    body: string;
    headers: Record<string, string | string[] | undefined>;
  },
): Promise<string> {
  return decodeTextBody(
    Buffer.from(response.body, "latin1"),
    getSingleHeaderValue(response.headers, "content-encoding"),
    { maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES },
  );
}
