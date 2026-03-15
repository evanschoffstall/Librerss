import net from "node:net";

import { resolvesToBlockedAddress } from "@/lib/core/dns-cache";
import { SOCKS_PROTOCOLS } from "@/lib/fetch";
import { logger } from "@/lib/logger";
import { isBlockedHost, normalizeHostname } from "@/lib/utils/ssrf";
import { redactUrlForLogs } from "@/lib/utils/url";

export type ProxyStatus = "checking" | "reachable" | "unreachable";

export const MAX_PROXY_URL_LENGTH = 2048;
// Proxy credential fields are stored in DB columns of type text (unbounded).
// Cap them to a reasonable value to prevent oversized writes via the API.
export const MAX_PROXY_CREDENTIAL_LENGTH = 255;

const VALID_PROTOCOLS = new Set(["http:", "https:", ...SOCKS_PROTOCOLS]);
/** Matches bare `host:port` strings (without scheme) that need `http://` prepended. */
const BARE_HOST_PORT_RE = /^[\w.-]+:\d{1,5}$/;
const PROBE_TIMEOUT_MS = 4000;

/**
 * Detect whether a proxy speaks SOCKS by sending a SOCKS5 greeting.
 * Returns "socks5" if the server replies with 0x05, otherwise "http".
 */
export async function detectProxyProtocol(
  host: string,
  port: number,
): Promise<"http" | "socks5"> {
  const normalizedHost = normalizeHostname(host);
  if (isBlockedHost(normalizedHost)) {
    logger.error("Proxy protocol detection blocked: internal hostname", {
      host: normalizedHost,
      port,
    });
    return "http";
  }
  // DNS rebinding prevention: re-resolve at probe time.
  if (await resolvesToBlockedAddress(normalizedHost)) {
    logger.error(
      "Proxy protocol detection blocked: hostname resolves to private address",
      { host: normalizedHost, port },
    );
    return "http";
  }
  const ctx = { host: normalizedHost, port };
  logger.info("Proxy protocol detection started", ctx);
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(PROBE_TIMEOUT_MS);
    let response = Buffer.alloc(0);
    const finish = (proto: "http" | "socks5", reason: string) => {
      socket.removeAllListeners();
      socket.destroy();
      logger.info("Proxy protocol detection completed", {
        ...ctx,
        detectedProtocol: proto,
        reason,
      });
      resolve(proto);
    };
    socket.on("connect", () => {
      logger.info(
        "Proxy detection TCP connected, sending SOCKS5 greeting",
        ctx,
      );
      // Offer both methods for protocol detection robustness:
      // no-auth (0x00) and username/password (0x02).
      // Some SOCKS servers require auth and may reject a no-auth-only greeting.
      socket.write(Buffer.from([0x05, 0x02, 0x00, 0x02]));
    });
    socket.on("data", (data: Buffer) => {
      response = Buffer.concat([response, data]);
      if (response.length < 1) return;
      if (response[0] !== 0x05) {
        finish(
          "http",
          `server replied ${response.length}B, first byte 0x${response[0].toString(16)} → not SOCKS`,
        );
        return;
      }
      if (response.length < 2) return;
      finish(
        "socks5",
        `server replied ${response.length}B, version 0x${response[0].toString(16)}, method 0x${response[1].toString(16)} → SOCKS5`,
      );
    });
    socket.on("timeout", () => {
      finish("http", "timeout waiting for SOCKS reply");
    });
    socket.on("error", (err) => {
      finish("http", `socket error: ${err.message}`);
    });
    socket.connect(port, normalizedHost);
  });
}

/**
 * Normalize a proxy URL string. Bare host:port is prefixed with http://.
 * If the scheme is http/https (or was bare), probes the port to detect SOCKS.
 * Explicit socks schemes are accepted as-is.
 */
export async function normalizeProxyUrl(
  raw: string,
  probeFn?: (host: string, port: number) => Promise<"http" | "socks5">,
  dnsCheckFn?: (host: string) => Promise<boolean>,
): Promise<null | string> {
  const needsScheme = BARE_HOST_PORT_RE.test(raw);
  if (needsScheme) {
    // Reject ports outside the valid TCP range even though `\d{1,5}` also
    // matches 65536–99999. The URL constructor would throw for those anyway,
    // but an explicit check gives a clearer error log.
    const port = Number(raw.split(":").at(-1));
    if (port < 1 || port > 65535) {
      logger.error("Proxy URL normalization failed: port out of valid range", {
        port,
        raw: redactUrlForLogs(raw),
      });
      return null;
    }
  }
  const input = needsScheme ? `http://${raw}` : raw;
  logger.info("Proxy URL normalization started", {
    input: redactUrlForLogs(input),
    needsScheme,
    raw: redactUrlForLogs(raw),
  });
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    logger.error("Proxy URL normalization failed: unparseable URL", {
      raw: redactUrlForLogs(raw),
    });
    return null;
  }
  if (!VALID_PROTOCOLS.has(parsed.protocol)) {
    logger.error("Proxy URL normalization failed: invalid protocol", {
      protocol: parsed.protocol,
      raw: redactUrlForLogs(raw),
    });
    return null;
  }

  // Already explicitly SOCKS — apply SSRF guards before accepting.
  if (SOCKS_PROTOCOLS.has(parsed.protocol)) {
    const host = normalizeHostname(parsed.hostname);
    if (isBlockedHost(host)) {
      logger.error("Proxy URL rejected: internal hostname (SOCKS)", {
        host,
        raw: redactUrlForLogs(raw),
      });
      return null;
    }
    const dnsCheck = dnsCheckFn ?? resolvesToBlockedAddress;
    if (await dnsCheck(host)) {
      logger.error(
        "Proxy URL rejected: hostname resolves to blocked address (SOCKS)",
        {
          host,
          raw: redactUrlForLogs(raw),
        },
      );
      return null;
    }
    logger.info(
      "Proxy URL normalization: explicit SOCKS scheme, skipping detection",
      { input: redactUrlForLogs(input) },
    );
    return input;
  }

  // http/https or bare — auto-detect.
  const hp = parseHostPort(input);
  if (!hp) return null;
  // SSRF guard: block internal/private hostnames before any TCP probe.
  if (isBlockedHost(hp.host)) {
    logger.error("Proxy URL rejected: internal hostname", {
      host: hp.host,
      raw: redactUrlForLogs(raw),
    });
    return null;
  }
  const dnsCheck = dnsCheckFn ?? resolvesToBlockedAddress;
  if (await dnsCheck(hp.host)) {
    logger.error("Proxy URL rejected: hostname resolves to blocked address", {
      host: hp.host,
      raw: redactUrlForLogs(raw),
    });
    return null;
  }
  const detect = probeFn ?? detectProxyProtocol;
  const proto = await detect(hp.host, hp.port);
  const normalized =
    proto === "socks5" ? `socks5://${hp.host}:${hp.port}` : input;
  logger.info("Proxy URL normalization completed", {
    detectedProtocol: proto,
    normalized: redactUrlForLogs(normalized),
    raw: redactUrlForLogs(raw),
  });
  return normalized;
}

/** TCP connect probe — resolves true if port is open, false on timeout/error.
 *  For SOCKS5 URLs with embedded credentials, performs a full auth handshake
 *  to verify the credentials are accepted before reporting reachable.
 *  Includes both static and DNS-rebinding SSRF guards. */
export async function probeProxy(
  proxyUrl: string,
  dnsCheckFn?: (host: string) => Promise<boolean>,
): Promise<boolean> {
  const hp = parseHostPort(proxyUrl);
  const safeProxyUrl = redactUrlForLogs(proxyUrl);
  if (!hp) {
    logger.error("Proxy probe skipped: could not parse host/port", {
      proxyUrl: safeProxyUrl,
    });
    return false;
  }
  // SSRF guard: static hostname patterns (fast path).
  if (isBlockedHost(hp.host)) {
    logger.error("Proxy probe blocked: internal hostname", {
      proxyUrl: safeProxyUrl,
    });
    return false;
  }
  // SSRF guard: DNS rebinding prevention — re-resolve at probe time.
  const dnsCheck = dnsCheckFn ?? resolvesToBlockedAddress;
  if (await dnsCheck(hp.host)) {
    logger.error("Proxy probe blocked: hostname resolves to private address", {
      proxyUrl: safeProxyUrl,
    });
    return false;
  }

  // For SOCKS5 with embedded credentials, do a full auth handshake.
  let parsed: null | URL = null;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    /* fall through */
  }
  if (parsed && SOCKS_PROTOCOLS.has(parsed.protocol) && parsed.username) {
    const username = decodeURIComponent(parsed.username);
    const password = parsed.password
      ? decodeURIComponent(parsed.password)
      : undefined;
    logger.info(
      `Proxy probe: SOCKS5 auth handshake. (proxyUrl=${safeProxyUrl})`,
    );
    const ok = await socks5AuthProbe(hp.host, hp.port, username, password);
    if (ok) {
      logger.info(
        `Proxy probe succeeded (SOCKS5 auth). (proxyUrl=${safeProxyUrl})`,
      );
    } else {
      logger.error(
        `Proxy probe failed: SOCKS5 auth rejected. (proxyUrl=${safeProxyUrl})`,
      );
    }
    return ok;
  }

  logger.info(`Proxy probe started. (proxyUrl=${safeProxyUrl})`);
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.on("connect", () => {
      socket.destroy();
      logger.info(`Proxy probe succeeded. (proxyUrl=${safeProxyUrl})`);
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      logger.error(
        `Proxy probe failed: timeout (proxyUrl=${safeProxyUrl} timeoutMs=${PROBE_TIMEOUT_MS})`,
      );
      resolve(false);
    });
    socket.on("error", (err) => {
      socket.destroy();
      logger.error(
        `Proxy probe failed: socket error (proxyUrl=${safeProxyUrl} error=${err.message})`,
      );
      resolve(false);
    });
    socket.connect(hp.port, hp.host);
  });
}

function parseHostPort(
  proxyUrl: string,
): null | { host: string; port: number } {
  try {
    const parsed = new URL(proxyUrl);
    const host = normalizeHostname(parsed.hostname);
    if (!host) {
      return null;
    }

    return {
      host,
      port:
        Number(parsed.port) ||
        (parsed.protocol === "https:"
          ? 443
          : parsed.protocol.startsWith("socks")
            ? 1080
            : 8080),
    };
  } catch {
    return null;
  }
}

/**
 * Perform a SOCKS5 auth probe: send greeting + auth sub-negotiation without
 * issuing a CONNECT to any destination. Returns true if the server accepts
 * auth (or no-auth). This validates credentials without touching any external
 * host.
 */
async function socks5AuthProbe(
  host: string,
  port: number,
  username?: string,
  password?: string,
): Promise<boolean> {
  const hasCredentials = !!username && !!password;
  // When credentials are provided, offer ONLY user/pass (0x02) — this forces the server
  // to verify them. Offering no-auth (0x00) alongside allows the server to bypass
  // credential checking by selecting no-auth, giving a false "success" result.
  const greeting = hasCredentials
    ? Buffer.from([0x05, 0x01, 0x02]) // VER, NMETHODS=1, user/pass only
    : Buffer.from([0x05, 0x01, 0x00]); // VER, NMETHODS=1, no-auth only
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(PROBE_TIMEOUT_MS);
    let stage: "auth" | "greeting" = "greeting";
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.on("connect", () => socket.write(greeting));
    socket.on("data", (data: Buffer) => {
      if (stage === "greeting") {
        if (data.length < 2 || data[0] !== 0x05) {
          finish(false);
          return;
        }
        const method = data[1];
        if (method === 0xff) {
          finish(false);
          return;
        } // no acceptable method
        if (method === 0x00) {
          finish(true);
          return;
        } // no-auth accepted
        if (method === 0x02 && hasCredentials) {
          stage = "auth";
          const user = Buffer.from(username, "utf8");
          const pass = Buffer.from(password, "utf8");
          const msg = Buffer.alloc(3 + user.length + pass.length);
          msg[0] = 0x01;
          msg[1] = user.length;
          user.copy(msg, 2);
          msg[2 + user.length] = pass.length;
          pass.copy(msg, 3 + user.length);
          socket.write(msg);
          return;
        }
        finish(false);
      } else {
        // auth sub-negotiation response: VER=1, STATUS (0x00=success)
        finish(data.length >= 2 && data[0] === 0x01 && data[1] === 0x00);
      }
    });
    socket.on("timeout", () => {
      finish(false);
    });
    socket.on("error", () => {
      finish(false);
    });
    socket.connect(port, host);
  });
}
