import { CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";
import { stripUrlFragment } from "@/lib/utils/url";
import axios from "axios";
import { wrapper as cookieJarWrapper } from "axios-cookiejar-support";
import * as dns from "dns";
import { HeaderGenerator } from "header-generator";
import * as http from "http";
import * as http2 from "http2";
import * as https from "https";
import * as net from "net";
// node-tls-client is loaded dynamically to avoid Turbopack bundling its native
// Go FFI library (koffi) — it must remain server-external.
import { SocksClient, type SocksClientOptions } from "socks";
import * as tls from "tls";
import { CookieJar } from "tough-cookie";
import * as zlib from "zlib";
import { SOCKS_PROTOCOLS } from "./proxy-config";

// Dedicated axios instance with cookie jar support for article extraction.
export const extractionAxios = cookieJarWrapper(axios.create());

const headerGen = new HeaderGenerator();

// ---------------------------------------------------------------------------
// node-tls-client (Go uTLS) — Chrome-exact JA3/JA4 TLS fingerprint
// ---------------------------------------------------------------------------

// Must match the ClientIdentifier used in tlsClientFetch — headers claim this version
// so the JA3/JA4 and sec-ch-ua are consistent (DataDome cross-checks them).
const TLS_CLIENT_CHROME_VER = 131;
// Correct brand list for Chrome 131 — header-generator often omits "Google Chrome"
// or uses wrong not-a-brand tokens, which is a trivial bot fingerprint signal.
const TLS_CLIENT_SEC_CH_UA =
  '"Chromium";v="131", "Google Chrome";v="131", "Not A(Brand";v="8"';

let tlsReady: boolean | null = null; // null = not attempted, true/false = result

/** Lazy one-shot init — downloads the Go shared library on first call. */
async function ensureTlsClient(): Promise<boolean> {
  if (tlsReady !== null) return tlsReady;
  try {
    const { initTLS } = await import("node-tls-client");
    await initTLS();
    tlsReady = true;
    logger.info("node-tls-client initialized (uTLS Chrome fingerprint active)");
  } catch (err) {
    tlsReady = false;
    logger.error("node-tls-client init failed, falling back to OpenSSL", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return tlsReady;
}

/** Flatten node-tls-client headers (string[] → string) to match RawResponse. */
function flattenHeaders(
  src: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
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

interface SocksTunnelResult {
  socket: net.Socket;
  /** Actual IP of the SOCKS server TCP peer — used for proxy-IP verification. */
  proxyIp: string | undefined;
  /** Destination as acknowledged by the SOCKS server. */
  remoteHost: { host: string; port: number } | undefined;
}

async function socksTunnel(
  proxyUrl: string,
  host: string,
  port: number,
): Promise<SocksTunnelResult> {
  const result = await SocksClient.createConnection({
    proxy: parseSocksProxy(proxyUrl),
    command: "connect",
    destination: { host, port },
  });
  return {
    socket: result.socket,
    proxyIp: result.socket.remoteAddress,
    remoteHost: result.remoteHost,
  };
}

/**
 * Chrome 135 JA3-matched TLS parameters.
 * Cipher order, curves, and sig algs must match Chrome exactly — WAFs like
 * DataDome fingerprint the TLS ClientHello independent of HTTP headers.
 */
const CHROME_TLS = {
  ciphers: [
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES128-SHA",
    "ECDHE-RSA-AES256-SHA",
    "AES128-GCM-SHA256",
    "AES256-GCM-SHA384",
  ].join(":"),
  ecdhCurve: "X25519:P-256:P-384",
  sigalgs: [
    "ecdsa_secp256r1_sha256",
    "rsa_pss_rsae_sha256",
    "rsa_pkcs1_sha256",
    "ecdsa_secp384r1_sha384",
    "rsa_pss_rsae_sha384",
    "rsa_pkcs1_sha384",
    "rsa_pss_rsae_sha512",
    "rsa_pkcs1_sha512",
    "ecdsa_secp521r1_sha512",
    "ed25519",
  ].join(":"),
  minVersion: "TLSv1.2" as const,
} satisfies tls.SecureContextOptions & { minVersion: tls.SecureVersion };

function tlsUpgrade(
  socket: net.Socket,
  host: string,
  rejectUnauthorized: boolean,
): Promise<{ tlsSocket: tls.TLSSocket; alpn: "h2" | "http/1.1" }> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      socket,
      servername: host,
      ALPNProtocols: ["h2", "http/1.1"],
      rejectUnauthorized,
      ...CHROME_TLS,
    });
    tlsSocket.once("secureConnect", () =>
      resolve({
        tlsSocket,
        alpn: tlsSocket.alpnProtocol === "h2" ? "h2" : "http/1.1",
      }),
    );
    tlsSocket.once("error", reject);
  });
}

// ---------------------------------------------------------------------------
// HTTP/2 request over a TLS socket
// ---------------------------------------------------------------------------

interface RawResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

async function h2Request(
  tlsSocket: tls.TLSSocket,
  url: URL,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const session = http2.connect(url.origin, {
      createConnection: () => tlsSocket as unknown as net.Socket,
    });
    session.once("error", reject);

    const reqHeaders: http2.OutgoingHttpHeaders = {
      [http2.constants.HTTP2_HEADER_METHOD]: "GET",
      [http2.constants.HTTP2_HEADER_PATH]: url.pathname + url.search,
      [http2.constants.HTTP2_HEADER_SCHEME]: url.protocol.replace(":", ""),
      [http2.constants.HTTP2_HEADER_AUTHORITY]: url.host,
    };
    for (const [k, v] of Object.entries(headers))
      reqHeaders[k.toLowerCase()] = v;

    const stream = session.request(reqHeaders, { endStream: true });
    const chunks: Buffer[] = [];
    let respHeaders: http2.IncomingHttpHeaders = {};
    let status = 0;

    stream.on("response", (h) => {
      respHeaders = h;
      status = Number(h[":status"] ?? 0);
    });
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => {
      session.close();
      const rawBody = Buffer.concat(chunks);
      const encoding = String(
        respHeaders["content-encoding"] ?? "",
      ).toLowerCase();
      decompressBody(rawBody, encoding).then(
        (body) =>
          resolve({
            statusCode: status,
            headers: respHeaders as Record<
              string,
              string | string[] | undefined
            >,
            body,
          }),
        reject,
      );
    });
    stream.on("error", (err) => {
      session.close();
      reject(err);
    });
    stream.setTimeout(timeoutMs, () => {
      stream.close(http2.constants.NGHTTP2_CANCEL);
      session.close();
      reject(new Error("HTTP/2 request timed out"));
    });
  });
}

// ---------------------------------------------------------------------------
// Shared: read an IncomingMessage into a RawResponse
// ---------------------------------------------------------------------------

function readIncomingMessage(
  res: http.IncomingMessage,
  resolve: (r: RawResponse) => void,
  reject: (e: unknown) => void,
): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("error", reject);
  res.on("end", () => {
    const rawBody = Buffer.concat(chunks);
    const encoding = String(
      res.headers["content-encoding"] ?? "",
    ).toLowerCase();
    decompressBody(rawBody, encoding).then(
      (body) =>
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body,
        }),
      reject,
    );
  });
}

// ---------------------------------------------------------------------------
// HTTP/1.1 request over a TLS socket
// ---------------------------------------------------------------------------

async function h1Request(
  tlsSocket: tls.TLSSocket,
  url: URL,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: Number(url.port) || 443,
        path: url.pathname + url.search,
        method: "GET",
        headers,
        createConnection: () => tlsSocket as unknown as net.Socket,
        timeout: timeoutMs,
      },
      (res) => readIncomingMessage(res, resolve, reject),
    );
    req.on("error", reject);
    req.on("timeout", () =>
      req.destroy(new Error("HTTP/1.1 request timed out")),
    );
    req.end();
  });
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
// Direct (non-proxy) fetch — no SOCKS, ALPN + h2 or h1.1
// ---------------------------------------------------------------------------

/** Shared plain-HTTP GET over an open (possibly tunneled) socket or directly. */
function httpPlainRequest(
  hostname: string,
  port: number,
  path: string,
  headers: Record<string, string>,
  timeoutMs: number,
  socket?: net.Socket,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port,
        path,
        method: "GET",
        headers,
        ...(socket ? { createConnection: () => socket } : {}),
        timeout: timeoutMs,
      },
      (res) => readIncomingMessage(res, resolve, reject),
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("HTTP request timed out")));
    req.end();
  });
}

async function directFetch(
  url: URL,
  headersFn: (alpn: "h2" | "http/1.1") => Record<string, string>,
  rejectUnauthorized: boolean,
  timeoutMs: number,
): Promise<TunnelResult> {
  // Plain HTTP — no TLS, no ALPN.
  if (url.protocol === "http:") {
    const port = Number(url.port) || 80;
    const headers = headersFn("http/1.1");
    const response = await httpPlainRequest(
      url.hostname,
      port,
      url.pathname + url.search,
      headers,
      timeoutMs,
    );
    return { response, alpn: "http/1.1", sentHeaders: headers };
  }

  // HTTPS — ALPN negotiation, h2 or http/1.1.
  return new Promise((resolve, reject) => {
    const socket = net.connect(
      { host: url.hostname, port: Number(url.port) || 443 },
      () => {
        const tlsSocket = tls.connect({
          socket,
          servername: url.hostname,
          ALPNProtocols: ["h2", "http/1.1"],
          rejectUnauthorized,
          ...CHROME_TLS,
        });
        tlsSocket.once("secureConnect", () => {
          const alpn: "h2" | "http/1.1" =
            tlsSocket.alpnProtocol === "h2" ? "h2" : "http/1.1";
          const headers = headersFn(alpn);
          (alpn === "h2"
            ? h2Request(tlsSocket, url, headers, timeoutMs)
            : h1Request(tlsSocket, url, headers, timeoutMs)
          ).then(
            (response) => resolve({ response, alpn, sentHeaders: headers }),
            reject,
          );
        });
        tlsSocket.once("error", reject);
      },
    );
    socket.once("error", reject);
    socket.setTimeout(timeoutMs, () =>
      socket.destroy(new Error("Direct connection timed out")),
    );
  });
}

// ---------------------------------------------------------------------------
// HTTP CONNECT proxy — tunnel through an HTTP(S) proxy, then TLS upgrade.
// Preserves Chrome TLS fingerprint through the proxy (same as SOCKS path).
// ---------------------------------------------------------------------------

function httpConnectTunnel(
  proxyUrl: string,
  targetHost: string,
  targetPort: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl);
    const proxyPort =
      Number(proxy.port) || (proxy.protocol === "https:" ? 443 : 8080);
    const authHeader =
      proxy.username &&
      `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`;

    const socket = net.connect(
      { host: proxy.hostname, port: proxyPort },
      () => {
        const lines = [
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
          `Host: ${targetHost}:${targetPort}`,
          ...(authHeader ? [`Proxy-Authorization: ${authHeader}`] : []),
          "",
          "",
        ];
        socket.write(lines.join("\r\n"));
      },
    );

    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      if (!buf.includes("\r\n\r\n")) return;
      socket.removeListener("data", onData);
      const statusLine = buf.split("\r\n")[0];
      const statusCode = Number(statusLine.split(" ")[1]);
      if (statusCode === 200) {
        resolve(socket);
      } else {
        socket.destroy();
        reject(
          new Error(`HTTP CONNECT proxy returned ${statusCode}: ${statusLine}`),
        );
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
    socket.setTimeout(timeoutMs, () =>
      socket.destroy(new Error("HTTP CONNECT proxy timed out")),
    );
  });
}

async function httpProxyFetch(
  url: URL,
  headersFn: (alpn: "h2" | "http/1.1") => Record<string, string>,
  proxyUrl: string,
  allowInsecureTls: boolean,
  timeoutMs: number,
): Promise<TunnelResult> {
  const port = Number(url.port) || (url.protocol === "http:" ? 80 : 443);

  if (url.protocol === "http:") {
    // Plain HTTP through CONNECT tunnel (rare but safe).
    const socket = await httpConnectTunnel(
      proxyUrl,
      url.hostname,
      port,
      timeoutMs,
    );
    const headers = headersFn("http/1.1");
    const response = await httpPlainRequest(
      url.hostname,
      port,
      url.pathname + url.search,
      headers,
      timeoutMs,
      socket,
    );
    return { response, alpn: "http/1.1", sentHeaders: headers };
  }

  // HTTPS: CONNECT tunnel → TLS upgrade (ALPN) → h2/h1 request.
  const socket = await httpConnectTunnel(
    proxyUrl,
    url.hostname,
    port,
    timeoutMs,
  );
  const { tlsSocket, alpn } = await tlsUpgrade(
    socket,
    url.hostname,
    !allowInsecureTls,
  );
  const headers = headersFn(alpn);

  logger.info("HTTP CONNECT proxy + TLS established", {
    url: url.toString(),
    alpn,
    proxyHost: new URL(proxyUrl).hostname,
  });

  const response =
    alpn === "h2"
      ? await h2Request(tlsSocket, url, headers, timeoutMs)
      : await h1Request(tlsSocket, url, headers, timeoutMs);
  return { response, alpn, sentHeaders: headers };
}

// ---------------------------------------------------------------------------
// Tunneled fetch — every byte through SOCKS, zero IP leak.
// Returns TLS metadata alongside the response so headers can be generated
// after ALPN negotiation on the same socket (no double-connect).
// ---------------------------------------------------------------------------

interface TunnelResult {
  response: RawResponse;
  alpn: "h2" | "http/1.1";
  sentHeaders: Record<string, string>;
}

async function tunnelFetch(
  url: URL,
  headersFn: (alpn: "h2" | "http/1.1") => Record<string, string>,
  proxyUrl: string,
  allowInsecureTls: boolean,
  timeoutMs: number,
): Promise<TunnelResult> {
  const port = Number(url.port) || (url.protocol === "http:" ? 80 : 443);

  const configuredProxyHost = new URL(proxyUrl).hostname;

  /**
   * Verify no proxy bypass / IP leak: the socket's actual TCP peer must be
   * the SOCKS proxy, not a direct path to the destination.
   *
   * - Resolves the configured proxy host to its canonical IP(s) via DNS.
   * - Compares socket.remoteAddress against every resolved address.
   * - Errors if none match — the process connected somewhere other than the
   *   declared proxy (bypass or misconfiguration).
   * - Also checks the SOCKS-handshake destination matches what was requested.
   */
  async function verifyNoLeak(
    actualIp: string | undefined,
    socksDestination: { host: string; port: number } | undefined,
    expectedHost: string,
    expectedPort: number,
  ): Promise<void> {
    const ctx = {
      configuredProxyHost,
      actualIp,
      target: `${expectedHost}:${expectedPort}`,
    };

    if (!actualIp) {
      logger.error(
        "SOCKS proxy leak check failed: socket.remoteAddress is undefined",
        ctx,
      );
      return;
    }

    // Resolve all IPs the proxy hostname maps to and confirm the socket landed on one of them.
    let resolvedProxyIps: string[];
    try {
      const results = await dns.promises
        .resolve(configuredProxyHost)
        .catch(() => dns.promises.resolve6(configuredProxyHost));
      resolvedProxyIps = results;
    } catch {
      // Proxy was likely configured as a bare IP — fall back to direct compare.
      resolvedProxyIps = [configuredProxyHost];
    }

    if (!resolvedProxyIps.includes(actualIp)) {
      logger.error(
        "SOCKS proxy IP leak detected: socket connected to unexpected IP — not the configured proxy",
        {
          ...ctx,
          resolvedProxyIps,
        },
      );
    } else {
      logger.info(
        "SOCKS proxy verified: socket.remoteAddress matches configured proxy",
        {
          ...ctx,
          resolvedProxyIps,
        },
      );
    }

    // Sanity-check the SOCKS handshake destination against what we requested.
    // Only validate when the proxy returns a non-empty host; some SOCKS5
    // servers omit it (port-only response) — that is not a mismatch.
    if (socksDestination?.host && socksDestination.port) {
      const destOk =
        socksDestination.host === expectedHost &&
        socksDestination.port === expectedPort;
      if (!destOk) {
        logger.error(
          "SOCKS destination mismatch: proxy tunneled to wrong endpoint",
          {
            ...ctx,
            socksDestination,
          },
        );
      }
    }
  }

  if (url.protocol === "http:") {
    const {
      socket: rawSocket,
      proxyIp,
      remoteHost: socksRemoteHost,
    } = await socksTunnel(proxyUrl, url.hostname, port);
    await verifyNoLeak(proxyIp, socksRemoteHost, url.hostname, port);
    const headers = headersFn("http/1.1");
    const response = await httpPlainRequest(
      url.hostname,
      port,
      url.pathname + url.search,
      headers,
      timeoutMs,
      rawSocket,
    );
    return { response, alpn: "http/1.1", sentHeaders: headers };
  }

  // HTTPS: SOCKS tunnel → TLS upgrade (ALPN) → generate headers → request
  // on the SAME socket. Zero double-connect, zero IP leak.
  const {
    socket: rawSocket,
    proxyIp,
    remoteHost: socksRemoteHost,
  } = await socksTunnel(proxyUrl, url.hostname, port);
  await verifyNoLeak(proxyIp, socksRemoteHost, url.hostname, port);

  const { tlsSocket, alpn } = await tlsUpgrade(
    rawSocket,
    url.hostname,
    !allowInsecureTls,
  );
  const headers = headersFn(alpn);

  logger.info("SOCKS tunnel + TLS established", {
    url: url.toString(),
    alpn,
    configuredProxyHost,
    actualProxyIp: proxyIp,
  });

  const response =
    alpn === "h2"
      ? await h2Request(tlsSocket, url, headers, timeoutMs)
      : await h1Request(tlsSocket, url, headers, timeoutMs);
  return { response, alpn, sentHeaders: headers };
}

// ---------------------------------------------------------------------------
// Header generation via header-generator (no got-scraping dependency)
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

  headers["accept-language"] = "en-US,en;q=0.9";
  headers["accept-encoding"] = "gzip, deflate, br, zstd";
  if (opts?.secChUa) headers["sec-ch-ua"] = opts.secChUa;
  if (opts?.accept) headers["accept"] = opts.accept;
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

/** OpenSSL transport selection: SOCKS tunnel, HTTP CONNECT, or direct. */
async function opensslFetch(
  parsed: URL,
  makeHeaders: (alpn: "h2" | "http/1.1") => Record<string, string>,
  isSocksProxy: boolean,
  isHttpProxy: boolean,
  proxyUrl: string | undefined,
  allowInsecureTls: boolean,
  rejectUnauth: boolean,
  timeoutMs: number,
): Promise<TunnelResult> {
  if (isSocksProxy && proxyUrl)
    return tunnelFetch(
      parsed,
      makeHeaders,
      proxyUrl,
      allowInsecureTls,
      timeoutMs,
    );
  if (isHttpProxy && proxyUrl)
    return httpProxyFetch(
      parsed,
      makeHeaders,
      proxyUrl,
      allowInsecureTls,
      timeoutMs,
    );
  return directFetch(parsed, makeHeaders, rejectUnauth, timeoutMs);
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

  const chromeVer = options?.browserVersion ?? 135;
  const requestOs = options?.operatingSystem ?? "windows";
  const isSocksProxy =
    !!options?.proxyUrl &&
    SOCKS_PROTOCOLS.has(new URL(options.proxyUrl).protocol);
  const isHttpProxy = !!options?.proxyUrl && !isSocksProxy;
  const proxyMode = isSocksProxy
    ? "socks"
    : options?.proxyUrl
      ? "http"
      : "direct";
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
    const rejectUnauth = !allowInsecureTls;

    // Deferred header generation: headers depend on negotiated ALPN, so we
    // pass a factory to tunnelFetch/directFetch and generate after TLS handshake.
    // Optional overrides let the tls-client path force Chrome 131 headers to
    // match the uTLS profile's JA3 — preventing a version mismatch signal.
    const makeHeaders = (
      alpn: "h2" | "http/1.1",
      overrides?: Partial<FingerprintFetchOptions>,
    ): Record<string, string> => {
      const effectiveOpts = overrides ? { ...options, ...overrides } : options;
      const h = generateBrowserHeaders(
        alpn === "h2" ? "2" : "1",
        effectiveOpts,
      );
      const jar = effectiveOpts?.cookieJar ?? options?.cookieJar;
      if (jar) {
        try {
          const cs = jar.getCookieStringSync(currentUrl);
          if (cs) h["cookie"] = cs;
        } catch {
          // skip
        }
      }
      return h;
    };

    logger.info("Fingerprint fetch attempt", {
      url: currentUrl,
      proxyMode,
      redirectHop: redirects,
      chromeVersion: chromeVer,
      tlsProfileVersion: tlsReady !== false ? TLS_CLIENT_CHROME_VER : null,
      os: requestOs,
    });

    let response: RawResponse;
    let usedHeaders: Record<string, string>;
    let negotiatedAlpn: "h2" | "http/1.1" | undefined;
    if (deps?.requestFn) {
      usedHeaders = makeHeaders("http/1.1");
      response = await deps.requestFn(parsed, usedHeaders);
    } else if (await ensureTlsClient()) {
      // Primary path: node-tls-client (Go uTLS) — Chrome-exact JA3/JA4.
      // uTLS handles SOCKS proxy natively, so no need for manual tunnel.
      // Force Chrome 131 headers to match the TLS profile — caller may have
      // requested 135 but the JA3 must agree with sec-ch-ua.
      usedHeaders = makeHeaders("h2", {
        browserVersion: TLS_CLIENT_CHROME_VER,
        secChUa: TLS_CLIENT_SEC_CH_UA,
      });
      try {
        response = await tlsClientFetch(
          parsed,
          usedHeaders,
          options?.proxyUrl,
          allowInsecureTls,
          timeoutMs,
        );
        negotiatedAlpn = "h2";
      } catch (tlsClientErr) {
        // uTLS failed — fall through to OpenSSL pipeline.
        logger.error("tls-client request failed, falling back to OpenSSL", {
          url: currentUrl,
          error:
            tlsClientErr instanceof Error
              ? tlsClientErr.message
              : String(tlsClientErr),
        });
        const result = await opensslFetch(
          parsed,
          makeHeaders,
          isSocksProxy,
          isHttpProxy,
          options?.proxyUrl,
          allowInsecureTls,
          rejectUnauth,
          timeoutMs,
        );
        response = result.response;
        usedHeaders = result.sentHeaders;
        negotiatedAlpn = result.alpn;
      }
    } else {
      const result = await opensslFetch(
        parsed,
        makeHeaders,
        isSocksProxy,
        isHttpProxy,
        options?.proxyUrl,
        allowInsecureTls,
        rejectUnauth,
        timeoutMs,
      );
      response = result.response;
      usedHeaders = result.sentHeaders;
      negotiatedAlpn = result.alpn;
    }
    logger.info("Fingerprint fetch response", {
      url: currentUrl,
      statusCode: response.statusCode,
      proxyMode,
      alpn: negotiatedAlpn,
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
        chromeVer,
        requestOs,
        allowInsecureTls,
        redirects,
        response.headers,
        usedHeaders as Record<string, string | string[] | undefined>,
      );
    }

    if (
      Buffer.byteLength(response.body, "utf8") >
      CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES
    )
      throw new Error("Upstream response too large");

    return {
      html: response.body,
      requestHeaders: usedHeaders as Record<
        string,
        string | string[] | undefined
      >,
    };
  }

  throw new Error("Too many redirects");
}
