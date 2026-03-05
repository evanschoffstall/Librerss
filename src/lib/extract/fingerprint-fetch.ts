import { CONFIG } from "@/lib/config";
import { stripUrlFragment } from "@/lib/utils/url";
import axios from "axios";
import { wrapper as cookieJarWrapper } from "axios-cookiejar-support";
import { SocksProxyAgent } from "socks-proxy-agent";
import { CookieJar } from "tough-cookie";
import { SOCKS_PROTOCOLS } from "./proxy-config";

// Dedicated axios instance with cookie jar support for article extraction.
// Cookie jar support persists challenge cookies (Cloudflare, DataDome, Akamai)
// across all redirect hops within a single extraction attempt.
export const extractionAxios = cookieJarWrapper(axios.create());

interface FingerprintFetchOptions {
  proxyUrl?: string;
  allowInsecureTls?: boolean;
  operatingSystem?: "windows" | "macos" | "linux";
  browserVersion?: number;
  // Persistent cookie jar for this attempt — carries challenge cookies across
  // redirect hops (PerimeterX/Cloudflare challenge→redirect→content flows).
  cookieJar?: CookieJar;
  // Per-version sec-ch-ua brand string override.
  secChUa?: string;
  // Navigation Accept header sent by this Chrome version.
  accept?: string;
  // Referer header — signals organic navigation (search result click).
  referer?: string;
}

// Carries full got-scraping response context up to the retry loop so all
// fields land in one consolidated error log rather than a separate non-2xx log.
export class GotScrapingError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: string,
    readonly proxyMode: string,
    readonly proxyAddress: string | null,
    readonly browserVersion: number,
    readonly os: string,
    readonly allowInsecureTls: boolean,
    readonly redirectHop: number,
    readonly responseHeaders: Record<string, string | string[] | undefined>,
    // Actual headers sent by got-scraping on the wire (post header-generator merge).
    readonly requestHeaders: Record<string, string | string[] | undefined>,
  ) {
    super(`Upstream responded with status ${statusCode}`);
  }
}

/**
 * Extract a trimmed set of headers useful for diagnosing bot-detection blocks.
 * Includes common CDN/WAF signals without leaking sensitive values.
 */
export function pickDiagnosticHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const KEEP = new Set([
    "server",
    "via",
    "x-cache",
    "cf-ray",
    "x-datadome",
    "retry-after",
    "content-type",
  ]);
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (KEEP.has(lower) || lower.startsWith("x-px-")) {
      out[lower] = v;
    }
  }
  const sc = headers["set-cookie"];
  const scCount = Array.isArray(sc) ? sc.length : sc ? 1 : 0;
  if (scCount > 0) out["set-cookie-count"] = scCount;
  return out;
}

export async function fetchHtmlWithFingerprint(
  url: string,
  isAllowedUrl: (candidateUrl: string) => Promise<boolean>,
  options?: FingerprintFetchOptions,
): Promise<{
  html: string;
  requestHeaders: Record<string, string | string[] | undefined>;
}> {
  const { gotScraping } = await import("got-scraping");

  let currentUrl = stripUrlFragment(url);
  let isFirstValidation = true;

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    if (!(await isAllowedUrl(currentUrl))) {
      throw new Error(
        isFirstValidation ? "Blocked URL" : "Blocked redirect target",
      );
    }
    isFirstValidation = false;

    // got-scraping's built-in proxyUrl only supports HTTP/HTTPS proxies.
    // For SOCKS proxies, pass a SocksProxyAgent as the agent instead.
    const isSocksProxy =
      options?.proxyUrl &&
      SOCKS_PROTOCOLS.has(new URL(options.proxyUrl).protocol);
    const proxyOpts = options?.proxyUrl
      ? isSocksProxy
        ? (() => {
            const httpAgent = new SocksProxyAgent(options.proxyUrl!);
            const httpsAgent = new SocksProxyAgent(options.proxyUrl!);
            if (options.allowInsecureTls === true) {
              const origConnectHttp = httpAgent.connect.bind(httpAgent);
              httpAgent.connect = (req, opts) =>
                origConnectHttp(req, {
                  ...opts,
                  rejectUnauthorized: false,
                } as typeof opts);
              const origConnectHttps = httpsAgent.connect.bind(httpsAgent);
              httpsAgent.connect = (req, opts) =>
                origConnectHttps(req, {
                  ...opts,
                  rejectUnauthorized: false,
                } as typeof opts);
            }
            return { agent: { http: httpAgent, https: httpsAgent } };
          })()
        : { proxyUrl: options.proxyUrl }
      : {};

    const chromeVer = options?.browserVersion ?? 131;
    const proxyMode = isSocksProxy
      ? "socks"
      : options?.proxyUrl
        ? "http"
        : "direct";
    const requestOs = options?.operatingSystem ?? "windows";

    // For SOCKS proxies we pass a custom agent rather than got-scraping's
    // native proxyUrl, so got-scraping's context.proxyUrl is unset.
    // Without it, got-scraping's ALPN negotiation probe (browserHeadersHook →
    // getResolveProtocolFunction) falls back to a direct TLS connection to the
    // target host — bypassing the SOCKS proxy and leaking the real server IP.
    // On production (datacenter IP) this direct probe is flagged by PerimeterX
    // before the actual request even arrives from the proxy.
    // Fix: stub resolveProtocol to return http/1.1 unconditionally, eliminating
    // the direct outbound probe entirely. HTTP/1.1 is universally supported and
    // the header-generator output is equally valid for both HTTP versions.
    const resolveProtocolStub = isSocksProxy
      ? async () => ({ alpnProtocol: "http/1.1" as const })
      : undefined;

    const response = await gotScraping.get(currentUrl, {
      headerGeneratorOptions: {
        browsers: [
          { name: "chrome", minVersion: chromeVer, maxVersion: chromeVer },
        ],
        devices: ["desktop"],
        locales: ["en-US"],
        operatingSystems: [options?.operatingSystem ?? "windows"],
      },
      ...(resolveProtocolStub ? { resolveProtocol: resolveProtocolStub } : {}),
      headers: {
        // Chrome 131 always sends the q-value fallback — header-generator
        // drops it when only one locale is configured.
        "accept-language": "en-US,en;q=0.9",
        // Chrome 119+ negotiates zstd; omitting it is a fingerprinting gap
        // that DataDome and PerimeterX track as a bot signal.
        "accept-encoding": "gzip, deflate, br, zstd",
        ...(options?.secChUa && { "sec-ch-ua": options.secChUa }),
        ...(options?.accept && { Accept: options.accept }),
        ...(options?.referer && {
          Referer: options.referer,
          // Cross-site navigation signal: header-generator defaults to
          // "same-site" but a DDG referral is always cross-site.
          // Bot detectors (DataDome, PerimeterX) check this for consistency.
          "Sec-Fetch-Site": "cross-site",
        }),
        Priority: "u=0, i",
      },
      ...(options?.cookieJar ? { cookieJar: options.cookieJar } : {}),
      followRedirect: false,
      throwHttpErrors: false,
      timeout: { request: 25_000 },
      https: {
        rejectUnauthorized: options?.allowInsecureTls !== true,
      },
      responseType: "text",
      ...proxyOpts,
    });

    const responseBody = typeof response.body === "string" ? response.body : "";
    // Actual headers sent on the wire — captured post-hook so the full
    // browser-fingerprint set (from header-generator) is included.
    const sentHeaders = ((
      response as { request?: { options?: { headers?: unknown } } }
    ).request?.options?.headers ?? {}) as Record<
      string,
      string | string[] | undefined
    >;

    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (redirects === 5) throw new Error("Too many redirects");

      const locationHeader = response.headers.location;
      const location = Array.isArray(locationHeader)
        ? locationHeader[0]
        : locationHeader;

      if (typeof location !== "string" || !location.trim()) {
        throw new Error("Redirect without Location header");
      }

      currentUrl = stripUrlFragment(new URL(location, currentUrl).toString());
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new GotScrapingError(
        response.statusCode,
        responseBody,
        proxyMode,
        options?.proxyUrl ?? null,
        chromeVer,
        requestOs,
        options?.allowInsecureTls ?? false,
        redirects,
        response.headers as Record<string, string | string[] | undefined>,
        sentHeaders,
      );
    }

    if (
      Buffer.byteLength(responseBody, "utf8") >
      CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES
    ) {
      throw new Error("Upstream response too large");
    }

    return { html: responseBody, requestHeaders: sentHeaders };
  }

  throw new Error("Too many redirects");
}
