import axios from "axios";
import { CookieJar } from "tough-cookie";

import {
  ARTICLE_EXTRACT_SEC_CH_UA,
  EXTRACT_403_RETRIES,
  EXTRACT_FINGERPRINT_POOL,
  PROXY_FINGERPRINT_POOL,
} from "./constants";

import { toBodySnippet } from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import { isAllowedFeedUrl } from "@/lib/core/feed-url-validator";
import { fetchTextWithValidatedRedirects } from "@/lib/core/upstream-http";
import {
  type BotDetection,
  buildAxiosGet,
  buildDdgReferer,
  buildProxyConfig,
  detectBotProtection,
  fetchHtmlWithFingerprint,
  GotScrapingError,
  pickDiagnosticHeaders,
  SOCKS_PROTOCOLS,
} from "@/lib/fetch";
import { logger } from "@/lib/logger";
import { toErrorMessage } from "@/lib/utils/errors";
import { redactUrlForLogs } from "@/lib/utils/url";

interface FetchHtmlDeps {
  axiosGetFn?: typeof axios.get;
  delayFn?: (ms: number) => Promise<void>;
  fingerprintFetchFn?: typeof fetchHtmlWithFingerprint;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  isAxiosErrorFn?: typeof axios.isAxiosError;
}

interface FetchHtmlOptions {
  allowInsecureTls?: boolean;
  proxyUrl?: string;
  useProxy?: boolean;
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
  const allowInsecureTls = options?.allowInsecureTls === true;
  const useProxy = options?.useProxy === true;
  const configuredProxyUrl = options?.proxyUrl;

  // ── Proxy path: TLS fingerprint from first attempt ────────────────────────
  if (useProxy && configuredProxyUrl && !injectedGet) {
    let lastError: unknown;
    const attempts = 1 + EXTRACT_403_RETRIES;
    const proxyReferer = buildDdgReferer(url);
    const proxyMode = SOCKS_PROTOCOLS.has(new URL(configuredProxyUrl).protocol)
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
            accept: fp.accept,
            allowInsecureTls,
            browserVersion: fp.chromeVersion,
            cookieJar: new CookieJar(),
            proxyUrl: configuredProxyUrl,
            referer: proxyReferer,
            secChUa: fp.secChUa,
          },
        );
        logger.info(
          `Proxy extraction attempt ${attempt + 1}/${attempts} succeeded`,
          {
            allowInsecureTls,
            attempt: attempt + 1,
            attempts,
            headers: sentHeaders,
            proxyAddress: redactUrlForLogs(configuredProxyUrl),
            proxyMode,
            responseBodyLength: html.length,
            url,
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
          (/px[-_]captcha|perimeterx|\/_px\//i.test(gsErr.responseBody) ||
            Object.keys(gsErr.responseHeaders).some((h) =>
              h.toLowerCase().startsWith("x-px-"),
            ));
        const proxyDdDetected =
          is403 &&
          (() => {
            const dataDomeHeader = gsErr.responseHeaders["x-datadome"];
            if (typeof dataDomeHeader === "string") {
              return dataDomeHeader.toLowerCase() === "protected";
            }
            return Array.isArray(dataDomeHeader)
              ? dataDomeHeader.some(
                  (value) => value.toLowerCase() === "protected",
                )
              : false;
          })();
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
            allowInsecureTls,
            attempt: attempt + 1,
            attempts,
            headers: gsErr?.requestHeaders,
            proxyAddress: redactUrlForLogs(configuredProxyUrl),
            proxyMode: gsErr?.proxyMode ?? proxyMode,
            url,
            ...(gsErr && {
              redirectHop: gsErr.redirectHop,
              responseBodyLength: gsErr.responseBody.length,
              responseBodySnippet: toBodySnippet(gsErr.responseBody),
              responseHeaders: pickDiagnosticHeaders(gsErr.responseHeaders),
              statusCode: gsErr.statusCode,
            }),
            error: err instanceof Error ? err.message : String(err),
            ...(ipBlocked && {
              note: `${botProvider ?? "Unknown"} challenge detected — requires JS execution or residential proxy to bypass`,
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
  const attemptState: { botDetection: BotDetection; gotRetryable: boolean } = {
    botDetection: { detected: false },
    gotRetryable: false,
  };

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await delay(600 * attempt);

    const fp =
      EXTRACT_FINGERPRINT_POOL[attempt % EXTRACT_FINGERPRINT_POOL.length];
    const ua = injectedGet ? EXTRACT_FINGERPRINT_POOL[0].ua : fp.ua;
    const secChUa = injectedGet ? ARTICLE_EXTRACT_SEC_CH_UA : fp.secChUa;
    const secChUaPlatform = injectedGet ? '"Windows"' : fp.secChUaPlatform;
    const directReferer = injectedGet ? undefined : buildDdgReferer(url);

    const requestHeaders: Record<string, string> = {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "max-age=0",
      Priority: "u=0, i",
      "sec-ch-ua": secChUa,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": secChUaPlatform,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": directReferer ? "cross-site" : "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "User-Agent": ua,
      ...(directReferer ? { Referer: directReferer } : undefined),
    } as Record<string, string>;

    const jar = injectedGet ? undefined : new CookieJar();
    const insecureTls = allowInsecureTls && !injectedGet;
    const proxyUrl = useProxy && !injectedGet ? configuredProxyUrl : undefined;
    const proxyConfig = proxyUrl
      ? buildProxyConfig(proxyUrl, insecureTls)
      : undefined;
    const axiosProxyMode = proxyConfig ? proxyConfig.mode : "direct";
    const axiosGet = buildAxiosGet(injectedGet, proxyConfig, insecureTls, jar);

    let isFirstValidation = true;

    try {
      const html = await fetchTextWithValidatedRedirects(
        {
          assertAllowedUrl: async (candidateUrl) => {
            if (!(await isAllowedUrl(candidateUrl)))
              throw new Error(
                isFirstValidation ? "Blocked URL" : "Blocked redirect target",
              );
            isFirstValidation = false;
          },
          headers: requestHeaders,
          maxContentLengthBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
          maxRedirects: 5,
          onAxiosError: (error, isAxios) => {
            if (!isAxios(error)) return;
            const { bot, retryable } = detectBotProtection(error, isAxiosError);
            if (bot.detected) {
              attemptState.botDetection = bot;
              throw new Error(
                `Upstream blocked request with anti-bot protection (${bot.provider}) [HTTP 403]`,
              );
            }
            if (retryable) attemptState.gotRetryable = true;
          },
          timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
          url,
        },
        { axiosGetFn: axiosGet, isAxiosErrorFn: isAxiosError },
      );
      if (!injectedGet)
        logger.info(
          `Direct extraction attempt ${attempt + 1}/${attempts} succeeded`,
          {
            allowInsecureTls: insecureTls,
            attempt: attempt + 1,
            attempts,
            headers: requestHeaders,
            proxyAddress: proxyUrl ? redactUrlForLogs(proxyUrl) : null,
            proxyMode: axiosProxyMode,
            responseBodyLength: html.length,
            url,
          },
        );
      return html;
    } catch (err) {
      lastError = err;
      if (attemptState.botDetection.detected) break; // exit loop — TLS fallback handles this
      if (attemptState.gotRetryable && attempt < attempts - 1) continue;
      if (!injectedGet)
        logger.error(
          `Direct extraction attempt ${attempt + 1}/${attempts} failed (final)`,
          {
            allowInsecureTls: insecureTls,
            attempt: attempt + 1,
            attempts,
            error: toErrorMessage(err),
            headers: requestHeaders,
            proxyAddress: proxyUrl ? redactUrlForLogs(proxyUrl) : null,
            proxyMode: axiosProxyMode,
            url,
          },
        );
      throw err;
    }
  }

  // ── TLS fingerprint fallback (DataDome / PerimeterX only) ─────────────────
  if (attemptState.botDetection.detected && !injectedGet) {
    const detectedBot = attemptState.botDetection;
    const { challengeCookies, provider } = detectedBot;
    const connectionMode = useProxy ? "proxy" : "direct";
    const fallbackFp = PROXY_FINGERPRINT_POOL[0];
    const fpFallback = deps?.fingerprintFetchFn ?? fetchHtmlWithFingerprint;
    const logCtx = {
      allowInsecureTls,
      connectionMode,
      provider,
      proxyAddress:
        useProxy && configuredProxyUrl
          ? redactUrlForLogs(configuredProxyUrl)
          : null,
      url,
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
          accept: fallbackFp.accept,
          allowInsecureTls,
          cookieJar: fallbackJar,
          proxyUrl: useProxy ? configuredProxyUrl : undefined,
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
        error: toErrorMessage(fallbackErr),
        headers: fallbackGsErr?.requestHeaders,
      });
    }
  }

  throw lastError;
}
