import { CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";
import { stripUrlFragment } from "@/lib/utils/url";
import axios from "axios";
import { wrapper as cookieJarWrapper } from "axios-cookiejar-support";
import { HeaderGenerator } from "header-generator";
import type { SocksClientOptions } from "socks";
import { CookieJar } from "tough-cookie";
import * as zlib from "zlib";

// Dedicated axios instance with cookie jar support for article extraction.
export const extractionAxios = cookieJarWrapper(axios.create());

const headerGen = new HeaderGenerator();

// ---------------------------------------------------------------------------
// node-tls-client (Go uTLS) — Chrome-exact JA3/JA4 TLS fingerprint
// ---------------------------------------------------------------------------

// Must match the ClientIdentifier used in tlsClientFetch — headers claim this version
// so the JA3/JA4 and sec-ch-ua are consistent (DataDome cross-checks them).
const TLS_CLIENT_CHROME_VER = 131;
// Correct brand list for Chrome 131 — brand order matches real Chrome: Google Chrome first.
// Not A(Brand grease version for Chrome 131 is "24" (rotates per major release).
const TLS_CLIENT_SEC_CH_UA =
  '"Google Chrome";v="131", "Chromium";v="131", "Not A(Brand";v="24"';

let tlsReady: boolean | null = null; // null = not attempted, true/false = result

/** Lazy one-shot init — downloads the Go shared library on first call. */
async function ensureTlsClient(): Promise<boolean> {
  if (tlsReady !== null) return tlsReady;
  try {
    const { initTLS } = await import("node-tls-client");
    await initTLS();
    tlsReady = true;
    logger.info(
      "node-tls-client initialized (Chrome 131 uTLS fingerprint active)",
    );
  } catch (err) {
    tlsReady = false;
    logger.error("node-tls-client init failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return tlsReady;
}

/** Flatten node-tls-client headers (string[] → string) to match RawResponse. */
function flattenHeaders(
  src: Record<string, string | string[] | undefined> | null | undefined,
): Record<string, string | string[] | undefined> {
  if (!src) return {};
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(src))
    out[k.toLowerCase()] = Array.isArray(v) && v.length === 1 ? v[0] : v;
  return out;
}

/**
 * Perform an HTTP GET via node-tls-client with Chrome 131 uTLS profile.
 * Handles SOCKS/HTTP proxy, insecure TLS, and manual redirect control.
 * Returns the same RawResponse shape as the OpenSSL-based pipeline.
 */
async function tlsClientFetch(
  url: URL,
  headers: Record<string, string>,
  proxyUrl: string | undefined,
  allowInsecureTls: boolean,
  timeoutMs: number,
): Promise<RawResponse> {
  const { Session, ClientIdentifier } = await import("node-tls-client");

  const sanitizedProxyUrl =
    proxyUrl && proxyUrl !== "null" && proxyUrl !== "undefined"
      ? proxyUrl
      : undefined;

  const session = new Session({
    clientIdentifier: ClientIdentifier.chrome_131,
    timeout: timeoutMs,
    insecureSkipVerify: allowInsecureTls,
    ...(sanitizedProxyUrl ? { proxy: sanitizedProxyUrl } : {}),
  });

  try {
    const resp = await session.get(url.toString(), {
      headers: headers as Record<string, string | string[]>,
      followRedirects: false,
    });
    return {
      statusCode: resp.status,
      headers: flattenHeaders(
        resp.headers as Record<string, string | string[] | undefined>,
      ),
      body: resp.body,
    };
  } finally {
    try {
      await session.close();
    } catch {
      // Session already closed or init incomplete — ignore.
    }
  }
}

interface FingerprintFetchOptions {
  proxyUrl?: string;
  allowInsecureTls?: boolean;
  operatingSystem?: "windows" | "macos" | "linux";
  browserVersion?: number;
  cookieJar?: CookieJar;
  secChUa?: string;
  accept?: string;
  referer?: string;
}

/** Error carrying full response context for the retry loop's consolidated log. */
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
    readonly requestHeaders: Record<string, string | string[] | undefined>,
  ) {
    super(`Upstream responded with status ${statusCode}`);
  }
}

/** Extract diagnostic headers for logging (CDN/WAF signals, no sensitive values). */
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
    if (KEEP.has(lower) || lower.startsWith("x-px-")) out[lower] = v;
  }
  const sc = headers["set-cookie"];
  const scCount = Array.isArray(sc) ? sc.length : sc ? 1 : 0;
  if (scCount > 0) out["set-cookie-count"] = scCount;
  return out;
}

// ---------------------------------------------------------------------------
// SOCKS tunnel helpers — all TCP goes through the proxy, zero leak
// ---------------------------------------------------------------------------

export function parseSocksProxy(proxyUrl: string): SocksClientOptions["proxy"] {
  const parsed = new URL(proxyUrl);
  const type = parsed.protocol === "socks4:" ? 4 : 5;
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 1080,
    type: type as 4 | 5,
    ...(parsed.username ? { userId: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password
      ? { password: decodeURIComponent(parsed.password) }
      : {}),
  };
}

interface RawResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

// ---------------------------------------------------------------------------
// Decompression (br, gzip, deflate, zstd)
// ---------------------------------------------------------------------------

export function decompressBody(buf: Buffer, encoding: string): Promise<string> {
  if (encoding === "br")
    return new Promise((resolve, reject) =>
      zlib.brotliDecompress(buf, (err, r) =>
        err ? reject(err) : resolve(r.toString("utf-8")),
      ),
    );
  if (encoding === "gzip" || encoding === "x-gzip")
    return new Promise((resolve, reject) =>
      zlib.gunzip(buf, (err, r) =>
        err ? reject(err) : resolve(r.toString("utf-8")),
      ),
    );
  if (encoding === "deflate")
    return new Promise((resolve, reject) =>
      zlib.inflate(buf, (err, r) =>
        err ? reject(err) : resolve(r.toString("utf-8")),
      ),
    );
  if (encoding === "zstd") {
    // Node 22+ has built-in zstd support.
    const decompressZstd = (zlib as Record<string, unknown>).zstdDecompress as
      | typeof zlib.brotliDecompress
      | undefined;
    if (decompressZstd)
      return new Promise((resolve, reject) =>
        decompressZstd(buf, (err, r) =>
          err ? reject(err) : resolve(r.toString("utf-8")),
        ),
      );
  }
  return Promise.resolve(buf.toString("utf-8"));
}

// ---------------------------------------------------------------------------
// Header generation
// ---------------------------------------------------------------------------

/**
 * Strip browser-extension and non-Chrome product tokens from a User-Agent so
 * it matches a stock Chrome installation. header-generator's UA pool includes
 * profiles collected from browsers with extensions (SiderAI, Brave, Opera, …)
 * that are instant bot-detection signals.
 */
function sanitizeUserAgent(ua: string, chromeVer: number): string {
  // Truncate after the canonical Chrome/Safari suffix.
  const safariIdx = ua.indexOf("Safari/537.36");
  if (safariIdx !== -1) ua = ua.slice(0, safariIdx + "Safari/537.36".length);
  // Ensure Chrome/VERSION is present (some pool UAs drop it).
  const chromeToken = `Chrome/${chromeVer}.0.0.0`;
  if (!ua.includes(chromeToken)) ua = ua.replace(/Chrome\/[\d.]+/, chromeToken);
  return ua;
}

/** Correct sec-ch-ua-platform value for each OS. */
const PLATFORM_MAP: Record<string, string> = {
  windows: '"Windows"',
  macos: '"macOS"',
  linux: '"Linux"',
};

/**
 * Chrome's canonical header order for a navigation GET.
 * WAFs like DataDome fingerprint header ordering independently of TLS — an
 * out-of-order header set is a strong non-browser signal even when every
 * individual value is correct.
 */
const CHROME_HEADER_ORDER = [
  "host",
  "connection",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "upgrade-insecure-requests",
  "user-agent",
  "accept",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-user",
  "sec-fetch-dest",
  "referer",
  "accept-encoding",
  "accept-language",
  "cookie",
  "priority",
];

/** Re-order a header map to match Chrome's canonical order. */
function orderChromeHeaders(
  src: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of CHROME_HEADER_ORDER) {
    if (key in src) out[key] = src[key];
  }
  // Append any remaining headers not in the canonical list.
  for (const key of Object.keys(src)) {
    if (!(key in out)) out[key] = src[key];
  }
  return out;
}

/** Build correct sec-ch-ua for any Chrome major version with proper brand order. */
function buildSecChUa(chromeVer: number): string {
  // Not A(Brand grease version: Chrome 131 uses "24", others use "8".
  const notABrandVer = chromeVer === 131 ? "24" : "8";
  return `"Google Chrome";v="${chromeVer}", "Chromium";v="${chromeVer}", "Not A(Brand";v="${notABrandVer}"`;
}

export function generateBrowserHeaders(
  alpnHint: "1" | "2",
  opts?: FingerprintFetchOptions,
): Record<string, string> {
  const chromeVer = opts?.browserVersion ?? 135;
  const os = opts?.operatingSystem ?? "windows";

  const generated = headerGen.getHeaders({
    httpVersion: alpnHint,
    browsers: [
      { name: "chrome", minVersion: chromeVer, maxVersion: chromeVer },
    ],
    devices: ["desktop"],
    locales: ["en-US"],
    operatingSystems: [os],
  });

  // Normalize all generated header keys to lowercase so our overrides below
  // actually replace them instead of creating duplicate mixed-case headers
  // (a strong bot fingerprint signal detected by WAFs like DataDome).
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(generated))
    headers[k.toLowerCase()] = typeof v === "string" ? v : String(v);

  // Strip extension/addon tokens from UA (e.g. SiderAI, Brave, Opera).
  if (headers["user-agent"])
    headers["user-agent"] = sanitizeUserAgent(headers["user-agent"], chromeVer);

  // Enforce correct platform — header-generator sometimes mismatches OS.
  headers["sec-ch-ua-platform"] = PLATFORM_MAP[os] ?? '"Windows"';
  // Always override sec-ch-ua with correct brand order — header-generator pool has wrong order.
  headers["sec-ch-ua"] = opts?.secChUa ?? buildSecChUa(chromeVer);
  headers["sec-ch-ua-mobile"] = "?0";

  headers["accept-language"] = "en-US,en;q=0.9";
  headers["accept-encoding"] = "gzip, deflate, br, zstd";
  // Chrome's canonical navigation Accept — header-generator pool may have stale values.
  headers["accept"] =
    opts?.accept ??
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
  headers["upgrade-insecure-requests"] = "1";
  headers["sec-fetch-mode"] = "navigate";
  headers["sec-fetch-user"] = "?1";
  headers["sec-fetch-dest"] = "document";
  if (opts?.referer) {
    headers["referer"] = opts.referer;
    headers["sec-fetch-site"] = "cross-site";
  } else {
    // Direct navigation with no referrer — Chrome sends "none", not omitting.
    headers["sec-fetch-site"] = "none";
  }
  headers["priority"] = "u=0, i";

  // h2 pseudo-headers are injected by h2Request — strip them here.
  for (const k of Object.keys(headers)) {
    if (k.startsWith(":")) delete headers[k];
  }
  return orderChromeHeaders(headers);
}

// ---------------------------------------------------------------------------
// Public API — drop-in replacement, zero got-scraping dependency
// ---------------------------------------------------------------------------

/** Test-only dependency injection (same pattern as FetchHtmlDeps). */
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

  const requestOs = options?.operatingSystem ?? "windows";
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

    // Generate headers for Chrome 131 (fixed to h2 since tls-client always negotiates HTTP/2)
    const headers = generateBrowserHeaders("2", {
      ...options,
      browserVersion: TLS_CLIENT_CHROME_VER,
      secChUa: TLS_CLIENT_SEC_CH_UA,
      operatingSystem: requestOs,
    });

    // Add cookies from jar
    if (options?.cookieJar) {
      try {
        const cs = options.cookieJar.getCookieStringSync(currentUrl);
        if (cs) headers["Cookie"] = cs;
      } catch {
        // skip
      }
    }

    logger.info("Fingerprint fetch attempt (Chrome 131 uTLS)", {
      url: currentUrl,
      proxyMode,
      proxyUrl: options?.proxyUrl,
      redirectHop: redirects,
      os: requestOs,
    });

    let response: RawResponse;
    if (deps?.requestFn) {
      response = await deps.requestFn(parsed, headers);
    } else {
      // node-tls-client is required — fail loudly if unavailable
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

    // Store response cookies in the jar.
    if (options?.cookieJar) {
      const sc = response.headers["set-cookie"];
      const cookies = Array.isArray(sc)
        ? sc
        : typeof sc === "string"
          ? [sc]
          : [];
      for (const raw of cookies) {
        try {
          options.cookieJar.setCookieSync(raw, currentUrl);
        } catch {
          // malformed — skip
        }
      }
    }

    // Handle redirects manually.
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

    // Non-2xx → throw with full context.
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new GotScrapingError(
        response.statusCode,
        response.body,
        proxyMode,
        options?.proxyUrl ?? null,
        TLS_CLIENT_CHROME_VER,
        requestOs,
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
