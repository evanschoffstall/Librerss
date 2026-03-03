import { toBodySnippet } from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import { isAllowedFeedUrl } from "@/lib/core/feed-url-validator";
import { fetchTextWithValidatedRedirects } from "@/lib/core/upstream-http";
import { logger } from "@/lib/logger";
import { stripUrlFragment } from "@/lib/utils/url";
import axios from "axios";
import { wrapper as cookieJarWrapper } from "axios-cookiejar-support";
import https from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";
import { CookieJar } from "tough-cookie";
import {
  ARTICLE_EXTRACT_SEC_CH_UA,
  EXTRACT_403_RETRIES,
  EXTRACT_FINGERPRINT_POOL,
  PROXY_FINGERPRINT_POOL,
} from "./constants";

type FetchHtmlDeps = {
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  axiosGetFn?: typeof axios.get;
  isAxiosErrorFn?: typeof axios.isAxiosError;
};

interface FetchHtmlOptions {
  useProxy?: boolean;
  proxyUrl?: string;
  allowInsecureTls?: boolean;
}

type ProxyConfig =
  | {
      mode: "http";
      proxy: {
        host: string;
        port: number;
        protocol: string;
        auth?: { username: string; password: string };
      };
    }
  | { mode: "socks"; httpAgent: SocksProxyAgent; httpsAgent: SocksProxyAgent };

const SOCKS_PROTOCOLS = new Set([
  "socks:",
  "socks4:",
  "socks4a:",
  "socks5:",
  "socks5h:",
]);

/** Parse a proxy URL string into axios-compatible config (HTTP or SOCKS). */
function buildProxyConfig(
  proxyUrl: string,
  allowInsecureTls = false,
): ProxyConfig | false {
  try {
    const parsed = new URL(proxyUrl);
    if (SOCKS_PROTOCOLS.has(parsed.protocol)) {
      const agent = new SocksProxyAgent(proxyUrl);
      if (allowInsecureTls) {
        // Override the connect method to inject rejectUnauthorized: false
        // into the TLS upgrade options that socks-proxy-agent passes to
        // tls.connect(). Cast required because AgentConnectOpts union
        // doesn't expose TLS fields on the HTTP variant.
        const origConnect = agent.connect.bind(agent);
        agent.connect = (req, opts) =>
          origConnect(req, {
            ...opts,
            rejectUnauthorized: false,
          } as typeof opts);
      }
      return { mode: "socks", httpAgent: agent, httpsAgent: agent };
    }
    const result: ProxyConfig & { mode: "http" } = {
      mode: "http",
      proxy: {
        host: parsed.hostname,
        port:
          Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 8080),
        protocol: parsed.protocol.replace(":", ""),
      },
    };
    if (parsed.username)
      result.proxy.auth = {
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
      };
    return result;
  } catch {
    // Invalid proxy URL - return false
    return false;
  }
}

// Dedicated axios instance with cookie jar support for article extraction.
// Using a separate instance avoids polluting the global axios used by feed fetching.
// Cookie jar support persists challenge cookies (Cloudflare, DataDome, Akamai)
// across all redirect hops within a single extraction attempt.
const extractionAxios = cookieJarWrapper(axios.create());

interface FingerprintFetchOptions {
  proxyUrl?: string;
  allowInsecureTls?: boolean;
  operatingSystem?: "windows" | "macos" | "linux";
  browserVersion?: number;
  // Persistent cookie jar for this attempt — carries challenge cookies across
  // redirect hops (PerimeterX/Cloudflare challenge→redirect→content flows).
  cookieJar?: CookieJar;
  // Per-version sec-ch-ua brand string override (each Chrome release changes
  // the "not-a-brand" token format; explicit value avoids generator drift).
  secChUa?: string;
  // Navigation Accept header sent by this Chrome version (includes signed-exchange).
  accept?: string;
  // Referer header — signals organic navigation (search result click).
  // DataDome's behavioral scorer treats zero-Referer direct GETs as high-risk.
  referer?: string;
}

// Carries full got-scraping response context up to the retry loop so all
// fields land in one consolidated error log rather than a separate non-2xx log.
class GotScrapingError extends Error {
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
  ) {
    super(`Upstream responded with status ${statusCode}`);
  }
}

/**
 * Extract a trimmed set of headers useful for diagnosing bot-detection blocks.
 * Includes common CDN/WAF signals without leaking sensitive values.
 */
function pickDiagnosticHeaders(
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
  // Report set-cookie as a count only — values contain session tokens.
  const sc = headers["set-cookie"];
  const scCount = Array.isArray(sc) ? sc.length : sc ? 1 : 0;
  if (scCount > 0) out["set-cookie-count"] = scCount;
  return out;
}

export async function fetchHtmlWithFingerprint(
  url: string,
  isAllowedUrl: (candidateUrl: string) => Promise<boolean>,
  options?: FingerprintFetchOptions,
): Promise<string> {
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
            // Apply allowInsecureTls override to SOCKS agents.
            // When the agent establishes the TLS connection, got-scraping's
            // https.rejectUnauthorized option has no effect, so we must
            // override the agent's connect method directly.
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

    const chromeVer = options?.browserVersion ?? 130;
    const proxyMode = isSocksProxy
      ? "socks"
      : options?.proxyUrl
        ? "http"
        : "direct";
    const requestOs = options?.operatingSystem ?? "windows";

    const response = await gotScraping.get(currentUrl, {
      headerGeneratorOptions: {
        browsers: [
          { name: "chrome", minVersion: chromeVer, maxVersion: chromeVer },
        ],
        devices: ["desktop"],
        locales: ["en-US"],
        operatingSystems: [options?.operatingSystem ?? "windows"],
      },
      // Explicit header overrides: take precedence over generator output.
      // sec-ch-ua: version-accurate brand string (format changes per major release).
      // Accept: include signed-exchange which all Chrome navigation requests carry.
      // Priority: navigation fetch priority sent by Chrome 116+.
      ...(options?.secChUa || options?.accept || options?.referer
        ? {
            headers: {
              ...(options.secChUa && { "sec-ch-ua": options.secChUa }),
              ...(options.accept && { Accept: options.accept }),
              ...(options.referer && { Referer: options.referer }),
              Priority: "u=0, i",
            },
          }
        : {}),
      // Cookie jar: persists cookies set by challenge pages across redirect hops.
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

    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (redirects === 5) {
        throw new Error("Too many redirects");
      }

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
      );
    }

    if (
      Buffer.byteLength(responseBody, "utf8") >
      CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES
    ) {
      throw new Error("Upstream response too large");
    }

    return responseBody;
  }

  throw new Error("Too many redirects");
}

export async function fetchHtml(
  url: string,
  deps?: FetchHtmlDeps,
  options?: FetchHtmlOptions,
): Promise<string> {
  const isAllowedUrl = deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;

  // When axiosGetFn is injected (tests / external callers) fall back to the
  // original single-attempt behaviour — cookie jar and retry are production-only.
  const injectedGet = deps?.axiosGetFn;

  // Proxy mode with retry logic: got-scraping provides browser-like TLS fingerprinting
  // from the start, but we still need multiple attempts with different OS/browser fingerprints
  // to handle sites that block based on proxy IP reputation or require multiple probes.
  if (options?.useProxy && options.proxyUrl && !injectedGet) {
    let lastError: unknown;
    const attempts = 1 + EXTRACT_403_RETRIES;

    for (let attempt = 0; attempt < attempts; attempt++) {
      // Human-like delay between retries: base delay + random jitter.
      let delayMs = 0;
      if (attempt > 0) {
        delayMs = 800 * attempt + Math.floor(Math.random() * 400);
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }

      const fp =
        PROXY_FINGERPRINT_POOL[attempt % PROXY_FINGERPRINT_POOL.length];

      try {
        const html = await fetchHtmlWithFingerprint(url, isAllowedUrl, {
          proxyUrl: options.proxyUrl,
          allowInsecureTls: options.allowInsecureTls,
          operatingSystem: fp.os,
          browserVersion: fp.chromeVersion,
          cookieJar: new CookieJar(),
          secChUa: fp.secChUa,
          accept: fp.accept,
        });
        logger.info(
          `Proxy extraction attempt ${attempt + 1}/${attempts} succeeded`,
          {
            url,
            attempt: attempt + 1,
            attempts,
            delayMs: attempt > 0 ? delayMs : undefined,
            operatingSystem: fp.os,
            chromeVersion: fp.chromeVersion,
            proxyMode: SOCKS_PROTOCOLS.has(new URL(options.proxyUrl).protocol)
              ? "socks"
              : "http",
            proxyAddress: options.proxyUrl,
            allowInsecureTls: options.allowInsecureTls ?? false,
            secChUa: fp.secChUa,
            accept: fp.accept,
            responseBodyLength: html.length,
          },
        );
        return html;
      } catch (err) {
        lastError = err;
        const is403 =
          err instanceof Error &&
          /upstream responded with status 403/i.test(err.message);
        const willRetry = is403 && attempt < attempts - 1;
        const gsErr = err instanceof GotScrapingError ? err : null;

        logger.error(
          `Proxy extraction attempt ${attempt + 1}/${attempts} failed${willRetry ? " (will retry)" : " (final)"}`,
          {
            url,
            attempt: attempt + 1,
            attempts,
            delayMs: attempt > 0 ? delayMs : undefined,
            operatingSystem: fp.os,
            chromeVersion: fp.chromeVersion,
            proxyMode: gsErr?.proxyMode,
            proxyAddress: options.proxyUrl,
            allowInsecureTls: options.allowInsecureTls ?? false,
            secChUa: fp.secChUa,
            accept: fp.accept,
            ...(gsErr && {
              statusCode: gsErr.statusCode,
              redirectHop: gsErr.redirectHop,
              responseBodyLength: gsErr.responseBody.length,
              responseBodySnippet: toBodySnippet(gsErr.responseBody),
              responseHeaders: pickDiagnosticHeaders(gsErr.responseHeaders),
            }),
            error: err instanceof Error ? err.message : String(err),
            ...(!willRetry &&
              is403 && {
                note: "Site may be blocking proxy IP or requires manual access",
              }),
          },
        );

        // Only retry on 403 — other errors (network, timeout, 404, 5xx) are final.
        if (willRetry) continue;
        throw err;
      }
    }
    throw lastError;
  }

  let lastError: unknown;
  // Set to true when DataDome (x-datadome: protected) is detected on a 403.
  // Rotating axios fingerprints won't help — the block is at TLS/IP level.
  // The browser fallback runs after the loop exits.
  let dataDomeDetected = false;
  // Cookies captured from a DataDome 403 response. DataDome's challenge flow sets
  // a `datadome` cookie on the 403 — the follow-up request must carry it or the
  // TLS-fallback will receive the same 403 despite the improved fingerprint.
  let dataDomeChallengeSetCookies: string[] = [];
  // Set to true when PerimeterX (px-captcha challenge page or x-px-* headers) is
  // detected on a 403.  Same reasoning as DataDome — TLS fingerprint is the
  // distinguishing signal; UA rotation alone won't bypass it.
  let perimeterXDetected = false;

  const attempts = injectedGet ? 1 : 1 + EXTRACT_403_RETRIES;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Exponential backoff between retries (first attempt is immediate).
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 600 * attempt));
    }

    // Rotate fingerprint on each attempt. Injected callers (tests/overrides)
    // always use fingerprint pool index 0 so UA expectations stay stable.
    const fp =
      EXTRACT_FINGERPRINT_POOL[attempt % EXTRACT_FINGERPRINT_POOL.length];
    const ua = injectedGet ? EXTRACT_FINGERPRINT_POOL[0].ua : fp.ua;
    const secChUa = injectedGet ? ARTICLE_EXTRACT_SEC_CH_UA : fp.secChUa;
    const secChUaPlatform = injectedGet ? '"Windows"' : fp.secChUaPlatform;

    // Fresh cookie jar per attempt so challenge cookies issued by the bot-check
    // on hop N are carried to hop N+1 within this attempt, but stale/blocked
    // cookies from a previous failed attempt don't pollute the retry.
    const jar = injectedGet ? undefined : new CookieJar();
    const proxyUrl =
      options?.useProxy && !injectedGet ? options?.proxyUrl : undefined;
    const insecureTls = options?.allowInsecureTls === true && !injectedGet;
    const proxyConfig = proxyUrl
      ? buildProxyConfig(proxyUrl, insecureTls)
      : undefined;
    const insecureHttpsAgent = insecureTls
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;
    const proxyAxiosConfig =
      proxyConfig && proxyConfig.mode === "socks"
        ? {
            proxy: false as const,
            httpAgent: proxyConfig.httpAgent,
            httpsAgent: proxyConfig.httpsAgent,
          }
        : proxyConfig && proxyConfig.mode === "http"
          ? {
              proxy: proxyConfig.proxy,
              ...(insecureHttpsAgent && {
                httpsAgent: insecureHttpsAgent,
              }),
            }
          : insecureHttpsAgent
            ? { httpsAgent: insecureHttpsAgent }
            : {};
    const usingSocksProxy =
      proxyConfig !== undefined &&
      proxyConfig !== false &&
      proxyConfig.mode === "socks";
    // axios-cookiejar-support rejects requests with custom http(s).Agent,
    // so SOCKS proxy requests use a plain axios instance without jar support.
    // Cookie persistence is less important through a proxy anyway — the proxy
    // IP is the identity signal, not the cookie.
    const axiosGet: typeof axios.get = injectedGet
      ? injectedGet
      : usingSocksProxy
        ? (reqUrl, config) =>
            axios.get(reqUrl, {
              ...config,
              ...proxyAxiosConfig,
            })
        : (reqUrl, config) =>
            extractionAxios.get(reqUrl, {
              ...config,
              jar,
              ...proxyAxiosConfig,
            });

    let got403 = false;
    let isFirstValidation = true;

    try {
      return await fetchTextWithValidatedRedirects(
        {
          url,
          // 5 hops matches feed fetching. Article URLs from RSS often route through
          // tracking redirectors (feedproxy, dlvr.it, etc.) before reaching origin.
          maxRedirects: 5,
          timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
          maxContentLengthBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
          headers: {
            "User-Agent": ua,
            // Chrome 130 Accept header with modern image format support.
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "en-US,en;q=0.9",
            // Chrome 130 supports zstd in addition to gzip/deflate/br.
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Cache-Control": "max-age=0",
            "Upgrade-Insecure-Requests": "1",
            // Sec-Fetch-* direct-navigation policy (bookmark / typed URL).
            // Sec-Fetch-Site MUST be "none" — claiming same-origin while
            // arriving from an external IP is a top bot-detection signal.
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            // Chrome Client Hints — absence alongside a Chrome UA is an
            // immediate bot fingerprint flag.
            "sec-ch-ua": secChUa,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": secChUaPlatform,
            // Navigation fetch priority (Chrome 130).
            Priority: "u=0, i",
          },
          assertAllowedUrl: async (candidateUrl) => {
            if (!(await isAllowedUrl(candidateUrl))) {
              throw new Error(
                isFirstValidation ? "Blocked URL" : "Blocked redirect target",
              );
            }
            isFirstValidation = false;
          },
          onAxiosError: (error, isAxios) => {
            if (!isAxios(error)) return;
            const status = error.response?.status;
            if (status === 403) {
              got403 = true;
              const dataDomeHeader = String(
                error.response?.headers?.["x-datadome"] ?? "",
              ).toLowerCase();
              if (dataDomeHeader === "protected") {
                // DataDome detected: fingerprint rotation won't help — the block
                // operates at TLS (JA3) and IP-reputation level. Mark the flag so
                // the catch block exits the loop and the browser fallback runs.
                dataDomeDetected = true;
                // Capture any cookies DataDome set on this 403 — they must be
                // carried to the got-scraping fallback so the challenge is satisfied.
                const setCookie = error.response?.headers?.["set-cookie"];
                if (Array.isArray(setCookie)) {
                  dataDomeChallengeSetCookies = setCookie;
                } else if (typeof setCookie === "string") {
                  dataDomeChallengeSetCookies = [setCookie];
                }
                throw new Error(
                  "Upstream blocked request with anti-bot protection (DataDome) [HTTP 403]",
                );
              }
              // PerimeterX detection: challenge pages embed "px-captcha" in the
              // body; some enforcer configs also set x-px-* response headers.
              // TLS fingerprint rotation (got-scraping) is the correct bypass.
              const responseBody = String(error.response?.data ?? "");
              const resPxHeaders = Object.keys(error.response?.headers ?? {});
              const isPerimeterX =
                /px[-_]captcha|perimeterx|\/_px\//i.test(responseBody) ||
                resPxHeaders.some((h) => h.toLowerCase().startsWith("x-px-"));
              if (isPerimeterX) {
                perimeterXDetected = true;
                throw new Error(
                  "Upstream blocked request with anti-bot protection (PerimeterX) [HTTP 403]",
                );
              }
              // Other 403s: let the error propagate so the retry loop can catch it.
            }
          },
        },
        { axiosGetFn: axiosGet, isAxiosErrorFn: isAxiosError },
      );
    } catch (err) {
      lastError = err;
      if (dataDomeDetected || perimeterXDetected) {
        // Exit the fingerprint-rotation loop immediately: additional axios
        // requests from the same server IP won't bypass DataDome/PerimeterX —
        // the block is at the TLS/JA3 fingerprint level.  The got-scraping
        // fallback below sends a proper Chrome TLS hello which changes the
        // JA3 hash.
        break;
      }
      // Only retry on 403 — other errors (network, timeout, 404, 5xx) are final.
      if (got403 && attempt < attempts - 1) {
        continue;
      }
      throw err;
    }
  }

  // TLS fingerprint fallback: when DataDome or PerimeterX is detected by axios,
  // retry the request with got-scraping which spoofs the JA3/HTTP2 fingerprint
  // to match Chrome 130 at the TLS layer — something axios/Node.js cannot do
  // natively.  Injected callers (tests) always skip this path — they receive
  // the original error so existing test contracts are unchanged.
  if ((dataDomeDetected || perimeterXDetected) && !injectedGet) {
    const provider = dataDomeDetected ? "DataDome" : "PerimeterX";
    const connectionMode = options?.useProxy ? "proxy" : "direct";
    logger.info(
      `TLS fingerprint fallback started (${provider}, ${connectionMode})`,
    );
    try {
      // Pre-seed the cookie jar with any cookies from the DataDome challenge
      // response so the follow-up got-scraping request carries them.
      const fallbackJar = new CookieJar();
      for (const raw of dataDomeChallengeSetCookies) {
        try {
          fallbackJar.setCookieSync(raw, url);
        } catch {
          // Malformed Set-Cookie — skip silently.
        }
      }
      // Derive a search query from the URL slug — approximates the article
      // title without requiring it to be threaded through the call stack.
      const ddgQuery = (() => {
        try {
          const segments = new URL(url).pathname.split("/").filter(Boolean);
          const slug = segments[segments.length - 1] ?? "";
          return (
            slug
              .replace(/\.[^.]+$/, "") // strip extension
              .replace(/[-_]/g, " ")
              .trim() || "news right now"
          );
        } catch {
          return "news right now";
        }
      })();
      const html = await fetchHtmlWithFingerprint(url, isAllowedUrl, {
        proxyUrl: options?.useProxy ? options?.proxyUrl : undefined,
        allowInsecureTls: options?.allowInsecureTls,
        // Use the best fingerprint entry from the proxy pool for TLS spoofing.
        operatingSystem: PROXY_FINGERPRINT_POOL[0].os,
        browserVersion: PROXY_FINGERPRINT_POOL[0].chromeVersion,
        secChUa: PROXY_FINGERPRINT_POOL[0].secChUa,
        accept: PROXY_FINGERPRINT_POOL[0].accept,
        cookieJar: fallbackJar,
        // Mimic a search-result click — DataDome scores zero-Referer direct
        // GETs as high-risk bots; a referrer from a DDG results page for the
        // article title lowers the behavioral risk score.
        referer: `https://duckduckgo.com/?q=${encodeURIComponent(ddgQuery)}&ia=web`,
      });
      logger.info(
        `TLS fingerprint fallback succeeded (${provider}, ${html.length} bytes)`,
      );
      return html;
    } catch (fallbackErr) {
      logger.error(`TLS fingerprint fallback failed (${provider})`, {
        url,
        connectionMode,
        proxyAddress: options?.useProxy ? (options?.proxyUrl ?? null) : null,
        allowInsecureTls: options?.allowInsecureTls ?? false,
        error:
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr),
      });
      // Fall through and surface the original error to the caller.
    }
  }

  // Unreachable — the loop always throws or returns — but satisfies TS.
  throw lastError;
}
