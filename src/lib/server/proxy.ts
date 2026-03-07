import { resolvesToBlockedAddress } from "@/lib/core/dns-cache";
import { SOCKS_PROTOCOLS } from "@/lib/extract/proxy-config";
import { logger } from "@/lib/logger";
import { isBlockedHost } from "@/lib/utils/ssrf";
import { redactUrlForLogs } from "@/lib/utils/url";
import net from "node:net";

export type ProxyStatus = "reachable" | "unreachable" | "checking";

export type ProxySettingsResponse = {
  proxyUrl: string | null;
  configured: boolean;
  status: ProxyStatus;
  allowInsecureTls: boolean;
  error?: string;
};

export const MAX_PROXY_URL_LENGTH = 2048;

const VALID_PROTOCOLS = new Set(["http:", "https:", ...SOCKS_PROTOCOLS]);
const BARE_HOST_PORT_RE = /^[\w.-]+:\d{1,5}$/;
const PROBE_TIMEOUT_MS = 4000;
/** SOCKS5 greeting: version 5, 1 auth method, no-auth (0x00). */
const SOCKS5_GREETING = Buffer.from([0x05, 0x01, 0x00]);

function parseHostPort(
  proxyUrl: string,
): { host: string; port: number } | null {
  try {
    const parsed = new URL(proxyUrl);
    return {
      host: parsed.hostname,
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
 * Detect whether a proxy speaks SOCKS by sending a SOCKS5 greeting.
 * Returns "socks5" if the server replies with 0x05, otherwise "http".
 */
export async function detectProxyProtocol(
  host: string,
  port: number,
): Promise<"socks5" | "http"> {
  if (isBlockedHost(host)) {
    logger.error("Proxy protocol detection blocked: internal hostname", {
      host,
      port,
    });
    return "http";
  }
  // DNS rebinding prevention: re-resolve at probe time.
  if (await resolvesToBlockedAddress(host)) {
    logger.error(
      "Proxy protocol detection blocked: hostname resolves to private address",
      { host, port },
    );
    return "http";
  }
  const ctx = { host, port };
  logger.info("Proxy protocol detection started", ctx);
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(PROBE_TIMEOUT_MS);
    const finish = (proto: "socks5" | "http", reason: string) => {
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
      socket.write(SOCKS5_GREETING);
    });
    socket.on("data", (data: Buffer) => {
      const isSocks = data.length >= 2 && data[0] === 0x05;
      finish(
        isSocks ? "socks5" : "http",
        `server replied ${data.length}B, first byte 0x${data[0]?.toString(16) ?? "??"} → ${isSocks ? "SOCKS5" : "not SOCKS"}`,
      );
    });
    socket.on("timeout", () =>
      finish("http", "timeout waiting for SOCKS reply"),
    );
    socket.on("error", (err) =>
      finish("http", `socket error: ${(err as Error).message}`),
    );
    socket.connect(port, host);
  });
}

/**
 * Normalize a proxy URL string. Bare host:port is prefixed with http://.
 * If the scheme is http/https (or was bare), probes the port to detect SOCKS.
 * Explicit socks schemes are accepted as-is.
 */
export async function normalizeProxyUrl(
  raw: string,
  probeFn?: (host: string, port: number) => Promise<"socks5" | "http">,
  dnsCheckFn?: (host: string) => Promise<boolean>,
): Promise<string | null> {
  const needsScheme = BARE_HOST_PORT_RE.test(raw);
  const input = needsScheme ? `http://${raw}` : raw;
  logger.info("Proxy URL normalization started", {
    raw: redactUrlForLogs(raw),
    input: redactUrlForLogs(input),
    needsScheme,
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
      raw,
      protocol: parsed.protocol,
    });
    return null;
  }

  // Already explicitly SOCKS — apply SSRF guards before accepting.
  if (SOCKS_PROTOCOLS.has(parsed.protocol)) {
    if (isBlockedHost(parsed.hostname)) {
      logger.error("Proxy URL rejected: internal hostname (SOCKS)", {
        raw: redactUrlForLogs(raw),
        host: parsed.hostname,
      });
      return null;
    }
    const dnsCheck = dnsCheckFn ?? resolvesToBlockedAddress;
    if (await dnsCheck(parsed.hostname)) {
      logger.error(
        "Proxy URL rejected: hostname resolves to blocked address (SOCKS)",
        {
          raw: redactUrlForLogs(raw),
          host: parsed.hostname,
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
      raw: redactUrlForLogs(raw),
      host: hp.host,
    });
    return null;
  }
  const dnsCheck = dnsCheckFn ?? resolvesToBlockedAddress;
  if (await dnsCheck(hp.host)) {
    logger.error("Proxy URL rejected: hostname resolves to blocked address", {
      raw: redactUrlForLogs(raw),
      host: hp.host,
    });
    return null;
  }
  const detect = probeFn ?? detectProxyProtocol;
  const proto = await detect(hp.host, hp.port);
  const normalized =
    proto === "socks5" ? `socks5://${hp.host}:${hp.port}` : input;
  logger.info("Proxy URL normalization completed", {
    raw: redactUrlForLogs(raw),
    normalized: redactUrlForLogs(normalized),
    detectedProtocol: proto,
  });
  return normalized;
}

/** TCP connect probe — resolves true if port is open, false on timeout/error.
 *  Includes both static and DNS-rebinding SSRF guards. */
export async function probeProxy(proxyUrl: string): Promise<boolean> {
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
  if (await resolvesToBlockedAddress(hp.host)) {
    logger.error("Proxy probe blocked: hostname resolves to private address", {
      proxyUrl: safeProxyUrl,
    });
    return false;
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
        `Proxy probe failed: socket error (proxyUrl=${safeProxyUrl} error=${(err as Error).message})`,
      );
      resolve(false);
    });
    socket.connect(hp.port, hp.host);
  });
}
