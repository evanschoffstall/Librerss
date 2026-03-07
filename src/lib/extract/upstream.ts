import { toBodySnippet } from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import { isAllowedFeedUrl } from "@/lib/core/feed-url-validator";
import { fetchTextWithValidatedRedirects } from "@/lib/core/upstream-http";
import { logger } from "@/lib/logger";
import { toErrorMessage } from "@/lib/utils/errors";
import { redactUrlForLogs } from "@/lib/utils/url";
import axios from "axios";
import { CookieJar } from "tough-cookie";
import {
  buildAxiosGet,
  buildDdgReferer,
  buildProxyConfig,
  detectBotProtection,
  fetchHtmlWithFingerprint,
  GotScrapingError,
  pickDiagnosticHeaders,
  SOCKS_PROTOCOLS,
  type BotDetection,
} from "@/lib/fetch";
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
  fingerprintFetchFn?: typeof fetchHtmlWithFingerprint;
  delayFn?: (ms: number) => Promise<void>;
};

interface FetchHtmlOptions {
  useProxy?: boolean;
  proxyUrl?: string;
  allowInsecureTls?: boolean;
}

export async function fetchHtml(
  url: string,
  deps?: FetchHtmlDeps,
  options?: FetchHtmlOptions,
): Promise<string> {
  const isAllowedUrl = deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;
  const delay =
    deps?.delayFn ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const injectedGet = deps?.axiosGetFn;

  // ── Proxy path: TLS fingerprint from first attempt ────────────────────────
  if (options?.useProxy && options.proxyUrl && !injectedGet) {
    let lastError: unknown;
    const attempts = 1 + EXTRACT_403_RETRIES;
    const proxyReferer = buildDdgReferer(url);
    const proxyMode = SOCKS_PROTOCOLS.has(new URL(options.proxyUrl).protocol)
      ? "socks"
      : "http";
    const fpFetch = deps?.fingerprintFetchFn ?? fetchHtmlWithFingerprint;

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        const delayMs = 800 * attempt + Math.floor(Math.random() * 400);
        await delay(delayMs);
      }

      const fp =
        PROXY_FINGERPRINT_POOL[attempt % PROXY_FINGERPRINT_POOL.length];

      try {
        const { html, requestHeaders: sentHeaders } = await fpFetch(
          url,
          isAllowedUrl,
          {
            proxyUrl: options.proxyUrl,
            allowInsecureTls: options.allowInsecureTls,
            cookieJar: new CookieJar(),
            accept: fp.accept,
            referer: proxyReferer,
            browserVersion: fp.chromeVersion,
            secChUa: fp.secChUa,
          },
        );
        logger.info(
          `Proxy extraction attempt ${attempt + 1}/${attempts} succeeded`,
          {
            url,
            attempt: attempt + 1,
            attempts,
            proxyMode,
            proxyAddress: redactUrlForLogs(options.proxyUrl ?? ""),
            allowInsecureTls: options.allowInsecureTls ?? false,
            headers: sentHeaders,
            responseBodyLength: html.length,
          },
        );
        return html;
      } catch (err) {
        lastError = err;
        const gsErr = err instanceof GotScrapingError ? err : null;
        const is403 = gsErr?.statusCode === 403;
        const is429 = gsErr?.statusCode === 429;

        const proxyPxDetected =
          is403 &&
          gsErr !== null &&
          (/px[-_]captcha|perimeterx|\/_px\//i.test(gsErr.responseBody) ||
            Object.keys(gsErr.responseHeaders).some((h) =>
              h.toLowerCase().startsWith("x-px-"),
            ));
        const proxyDdDetected =
          is403 &&
          gsErr !== null &&
          String(gsErr.responseHeaders["x-datadome"] ?? "").toLowerCase() ===
            "protected";
        const ipBlocked = proxyPxDetected || proxyDdDetected;
        const botProvider = proxyPxDetected
          ? "PerimeterX"
          : proxyDdDetected
            ? "DataDome"
            : null;
        const willRetry =
          (is403 || is429) && !ipBlocked && attempt < attempts - 1;

        logger.error(
          `Proxy extraction attempt ${attempt + 1}/${attempts} failed${willRetry ? " (will retry)" : " (final)"}`,
          {
            url,
            attempt: attempt + 1,
            attempts,
            proxyMode: gsErr?.proxyMode ?? proxyMode,
            proxyAddress: redactUrlForLogs(options.proxyUrl ?? ""),
            allowInsecureTls: options.allowInsecureTls ?? false,
            headers: gsErr?.requestHeaders,
            ...(gsErr && {
              statusCode: gsErr.statusCode,
              redirectHop: gsErr.redirectHop,
              responseBodyLength: gsErr.responseBody.length,
              responseBodySnippet: toBodySnippet(gsErr.responseBody),
              responseHeaders: pickDiagnosticHeaders(gsErr.responseHeaders),
            }),
            error: err instanceof Error ? err.message : String(err),
            ...(ipBlocked && {
              note: `${botProvider} challenge detected — requires JS execution or residential proxy to bypass`,
            }),
            ...(!willRetry &&
              !ipBlocked &&
              (is403 || is429) && {
                note: "Site may be blocking proxy IP or requires manual access",
              }),
          },
        );

        if (willRetry) continue;
        throw err;
      }
    }
    throw lastError;
  }

  // ── Direct path: axios with fingerprint rotation, then TLS fallback ───────
  const attempts = injectedGet ? 1 : 1 + EXTRACT_403_RETRIES;
  let lastError: unknown;
  let botDetection: BotDetection = { detected: false };

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await delay(600 * attempt);

    const fp =
      EXTRACT_FINGERPRINT_POOL[attempt % EXTRACT_FINGERPRINT_POOL.length];
    const ua = injectedGet ? EXTRACT_FINGERPRINT_POOL[0].ua : fp.ua;
    const secChUa = injectedGet ? ARTICLE_EXTRACT_SEC_CH_UA : fp.secChUa;
    const secChUaPlatform = injectedGet ? '"Windows"' : fp.secChUaPlatform;
    const directReferer = injectedGet ? undefined : buildDdgReferer(url);

    const requestHeaders: Record<string, string> = {
      "User-Agent": ua,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Cache-Control": "max-age=0",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": directReferer ? "cross-site" : "none",
      "Sec-Fetch-User": "?1",
      "sec-ch-ua": secChUa,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": secChUaPlatform,
      Priority: "u=0, i",
      ...(directReferer ? { Referer: directReferer } : undefined),
    } as Record<string, string>;

    const jar = injectedGet ? undefined : new CookieJar();
    const insecureTls = options?.allowInsecureTls === true && !injectedGet;
    const proxyUrl =
      options?.useProxy && !injectedGet ? options?.proxyUrl : undefined;
    const proxyConfig = proxyUrl
      ? buildProxyConfig(proxyUrl, insecureTls)
      : undefined;
    const axiosProxyMode = proxyConfig ? proxyConfig.mode : "direct";
    const axiosGet = buildAxiosGet(injectedGet, proxyConfig, insecureTls, jar);

    let gotRetryable = false;
    let isFirstValidation = true;

    try {
      const html = await fetchTextWithValidatedRedirects(
        {
          url,
          maxRedirects: 5,
          timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
          maxContentLengthBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
          headers: requestHeaders,
          assertAllowedUrl: async (candidateUrl) => {
            if (!(await isAllowedUrl(candidateUrl)))
              throw new Error(
                isFirstValidation ? "Blocked URL" : "Blocked redirect target",
              );
            isFirstValidation = false;
          },
          onAxiosError: (error, isAxios) => {
            if (!isAxios(error)) return;
            const { retryable, bot } = detectBotProtection(error, isAxiosError);
            if (bot.detected) {
              botDetection = bot;
              throw new Error(
                `Upstream blocked request with anti-bot protection (${bot.provider}) [HTTP 403]`,
              );
            }
            if (retryable) gotRetryable = true;
          },
        },
        { axiosGetFn: axiosGet, isAxiosErrorFn: isAxiosError },
      );
      if (!injectedGet)
        logger.info(
          `Direct extraction attempt ${attempt + 1}/${attempts} succeeded`,
          {
            url,
            attempt: attempt + 1,
            attempts,
            proxyMode: axiosProxyMode,
            proxyAddress: proxyUrl ? redactUrlForLogs(proxyUrl) : null,
            allowInsecureTls: insecureTls,
            headers: requestHeaders,
            responseBodyLength: html.length,
          },
        );
      return html;
    } catch (err) {
      lastError = err;
      if (botDetection.detected) break; // exit loop — TLS fallback handles this
      if (gotRetryable && attempt < attempts - 1) continue;
      if (!injectedGet)
        logger.error(
          `Direct extraction attempt ${attempt + 1}/${attempts} failed (final)`,
          {
            url,
            attempt: attempt + 1,
            attempts,
            proxyMode: axiosProxyMode,
            proxyAddress: proxyUrl ? redactUrlForLogs(proxyUrl) : null,
            allowInsecureTls: insecureTls,
            headers: requestHeaders,
            error: toErrorMessage(err),
          },
        );
      throw err;
    }
  }

  // ── TLS fingerprint fallback (DataDome / PerimeterX only) ─────────────────
  if (botDetection.detected && !injectedGet) {
    const detectedBot = botDetection as Extract<
      BotDetection,
      { detected: true }
    >;
    const { provider, challengeCookies } = detectedBot;
    const connectionMode = options?.useProxy ? "proxy" : "direct";
    const fallbackFp = PROXY_FINGERPRINT_POOL[0];
    const fpFallback = deps?.fingerprintFetchFn ?? fetchHtmlWithFingerprint;
    const logCtx = {
      url,
      provider,
      connectionMode,
      proxyAddress: options?.useProxy
        ? redactUrlForLogs(options?.proxyUrl ?? "")
        : null,
      allowInsecureTls: options?.allowInsecureTls ?? false,
    };
    logger.info(
      `TLS fingerprint fallback started (${provider}, ${connectionMode})`,
      logCtx,
    );

    try {
      const fallbackJar = new CookieJar();
      for (const raw of challengeCookies) {
        try {
          fallbackJar.setCookieSync(raw, url);
        } catch {
          /* malformed — skip */
        }
      }
      const { html, requestHeaders: sentHeaders } = await fpFallback(
        url,
        isAllowedUrl,
        {
          proxyUrl: options?.useProxy ? options?.proxyUrl : undefined,
          allowInsecureTls: options?.allowInsecureTls,
          accept: fallbackFp.accept,
          cookieJar: fallbackJar,
          referer: buildDdgReferer(url),
        },
      );
      logger.info(
        `TLS fingerprint fallback succeeded (${provider}, ${html.length} bytes)`,
        {
          ...logCtx,
          headers: sentHeaders,
          responseBodyLength: html.length,
        },
      );
      return html;
    } catch (fallbackErr) {
      const fallbackGsErr =
        fallbackErr instanceof GotScrapingError ? fallbackErr : null;
      logger.error(`TLS fingerprint fallback failed (${provider})`, {
        ...logCtx,
        headers: fallbackGsErr?.requestHeaders,
        error: toErrorMessage(fallbackErr),
      });
    }
  }

  throw lastError;
}
