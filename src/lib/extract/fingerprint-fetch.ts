import { CONFIG } from "@/lib/config";
import { stripUrlFragment } from "@/lib/utils/url";
import axios from "axios";
import { wrapper as cookieJarWrapper } from "axios-cookiejar-support";
import { SocksClient } from "socks";
import { SocksProxyAgent } from "socks-proxy-agent";
import * as tls from "tls";
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

/**
 * Perform an ALPN negotiation (h2 / http/1.1) against targetHost:targetPort
 * tunnelled entirely through the SOCKS proxy, so the real server IP never
 * contacts the target directly.  Falls back to http/1.1 on any error.
 */
async function resolveAlpnViaSocks(
  proxyUrl: string,
  targetHost: string,
  targetPort: number,
): Promise<"h2" | "http/1.1"> {
  const proxy = new URL(proxyUrl);
  const socksType = proxy.protocol === "socks4:" ? 4 : 5;
  let rawSocket: import("net").Socket | undefined;
  try {
    const { socket } = await SocksClient.createConnection({
      proxy: {
        host: proxy.hostname,
        port: Number(proxy.port) || 1080,
        type: socksType,
        ...(proxy.username
          ? { userId: decodeURIComponent(proxy.username) }
          : {}),
        ...(proxy.password
          ? { password: decodeURIComponent(proxy.password) }
          : {}),
      },
      command: "connect",
      destination: { host: targetHost, port: targetPort },
    });
    rawSocket = socket;
    return await new Promise<"h2" | "http/1.1">((resolve) => {
      const tlsSocket = tls.connect({
        socket,
        servername: targetHost,
        ALPNProtocols: ["h2", "http/1.1"],
        // Probe only — no data exchanged, cert validity irrelevant.
        rejectUnauthorized: false,
      });
      const cleanup = (proto: "h2" | "http/1.1") => {
        tlsSocket.destroy();
        socket.destroy();
        resolve(proto);
      };
      tlsSocket.once("secureConnect", () =>
        cleanup(tlsSocket.alpnProtocol === "h2" ? "h2" : "http/1.1"),
      );
      tlsSocket.once("error", () => cleanup("http/1.1"));
    });
  } catch {
    rawSocket?.destroy();
    return "http/1.1";
  }
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
    // Without it, got-scraping's browserHeadersHook → getResolveProtocolFunction
    // falls back to a direct TLS connection to the target — leaking the real
    // server IP to PerimeterX/DataDome before the proxied request even arrives.
    //
    // Cannot use a top-level `resolveProtocol` option — got's Options.assign()
    // throws "Unexpected option" for unknown keys. Instead, inject via a
    // beforeRequest hook (same pattern got-scraping uses internally at ~line 720).
    //
    // Fix: perform a real ALPN probe tunnelled through the SOCKS proxy so the
    // negotiated protocol is correct for both http/1.1 and h2-capable sites.
    const socksAlpnHook = isSocksProxy
      ? [
          async (opts: Record<string, unknown>) => {
            const target = new URL(currentUrl);
            const port =
              Number(target.port) || (target.protocol === "http:" ? 80 : 443);
            const proto = await resolveAlpnViaSocks(
              options!.proxyUrl!,
              target.hostname,
              port,
            );
            // Write directly — bypasses got's Options.assign() key validation.
            opts.resolveProtocol = async () => ({ alpnProtocol: proto });
          },
        ]
      : [];

    const response = await gotScraping.get(currentUrl, {
      headerGeneratorOptions: {
        browsers: [
          { name: "chrome", minVersion: chromeVer, maxVersion: chromeVer },
        ],
        devices: ["desktop"],
        locales: ["en-US"],
        operatingSystems: [options?.operatingSystem ?? "windows"],
      },
      ...(socksAlpnHook.length > 0
        ? { hooks: { beforeRequest: socksAlpnHook } }
        : {}),
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
