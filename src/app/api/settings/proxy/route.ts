import { parseJsonBodyOrResponse } from "@/lib/api/http";
import { resolvesToBlockedAddress } from "@/lib/core/dns-cache";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  requireMutableAuthenticatedUser,
  type AuthenticatedUser,
} from "@/lib/server";
import { isBlockedHost } from "@/lib/utils/ssrf";
import { redactUrlForLogs } from "@/lib/utils/url";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import net from "node:net";

export const dynamic = "force-dynamic";

export type ProxyStatus = "reachable" | "unreachable" | "checking";

export type ProxySettingsResponse = {
  proxyUrl: string | null;
  configured: boolean;
  status: ProxyStatus;
  allowInsecureTls: boolean;
  error?: string;
};

export type ProxyRouteDeps = {
  requireAuthFn?: (
    request: NextRequest,
  ) => Promise<AuthenticatedUser | Response>;
  probeFn?: (proxyUrl: string) => Promise<boolean>;
  detectFn?: (host: string, port: number) => Promise<"socks5" | "http">;
  dnsCheckFn?: (host: string) => Promise<boolean>;
};

const MAX_PROXY_URL_LENGTH = 2048;
const SOCKS_PROTOCOLS = new Set([
  "socks:",
  "socks4:",
  "socks4a:",
  "socks5:",
  "socks5h:",
]);
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
    // Invalid URL format — return null to indicate parse failure
    return null;
  }
}

/**
 * Detect whether a proxy speaks SOCKS by sending a SOCKS5 greeting.
 * Returns "socks5" if the server replies with 0x05, otherwise "http".
 */
export function detectProxyProtocol(
  host: string,
  port: number,
): Promise<"socks5" | "http"> {
  // SSRF guard: refuse to probe internal/private hosts.
  if (isBlockedHost(host)) {
    logger.error("Proxy protocol detection blocked: internal hostname", {
      host,
      port,
    });
    return Promise.resolve("http");
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

/** TCP connect probe — resolves true if port is open, false on timeout/error. */
export function probeProxy(proxyUrl: string): Promise<boolean> {
  const hp = parseHostPort(proxyUrl);
  const safeProxyUrl = redactUrlForLogs(proxyUrl);
  if (!hp) {
    logger.error("Proxy probe skipped: could not parse host/port", {
      proxyUrl: safeProxyUrl,
    });
    return Promise.resolve(false);
  }
  // SSRF guard: refuse to probe internal/private hosts.
  if (isBlockedHost(hp.host)) {
    logger.error("Proxy probe blocked: internal hostname", {
      proxyUrl: safeProxyUrl,
    });
    return Promise.resolve(false);
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

function unconfiguredResponse(error?: string): Response {
  return NextResponse.json({
    proxyUrl: null,
    configured: false,
    status: "unreachable" as ProxyStatus,
    allowInsecureTls: false,
    ...(error && { error }),
  });
}

async function probeAndRespond(
  proxyUrl: string,
  probe: (url: string) => Promise<boolean>,
  logLabel: string,
  allowInsecureTls = false,
): Promise<Response> {
  const reachable = await probe(proxyUrl);
  if (!reachable)
    logger.error(logLabel, { proxyUrl: redactUrlForLogs(proxyUrl) });
  return NextResponse.json({
    proxyUrl,
    configured: true,
    status: (reachable ? "reachable" : "unreachable") as ProxyStatus,
    allowInsecureTls,
  });
}

async function resolveAuth(
  request: NextRequest,
  deps: ProxyRouteDeps,
): Promise<
  | {
      auth: AuthenticatedUser;
      probe: (url: string) => Promise<boolean>;
      detect: (host: string, port: number) => Promise<"socks5" | "http">;
      dnsCheck: (host: string) => Promise<boolean>;
    }
  | Response
> {
  const requireAuth = deps.requireAuthFn ?? requireMutableAuthenticatedUser;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  return {
    auth,
    probe: deps.probeFn ?? probeProxy,
    detect: deps.detectFn ?? detectProxyProtocol,
    dnsCheck: deps.dnsCheckFn ?? resolvesToBlockedAddress,
  };
}

export async function GET(request: NextRequest, deps: ProxyRouteDeps = {}) {
  const result = await resolveAuth(request, deps);
  if (result instanceof Response) return result;

  const db = getDb();
  const [user] = await db
    .select({
      proxyUrl: users.proxyUrl,
      allowInsecureTls: users.allowInsecureTls,
    })
    .from(users)
    .where(eq(users.id, result.auth.userId))
    .limit(1);

  const proxyUrl = user?.proxyUrl?.trim() || null;
  if (!proxyUrl) return unconfiguredResponse();
  return probeAndRespond(
    proxyUrl,
    result.probe,
    "Proxy unreachable on GET",
    user?.allowInsecureTls ?? false,
  );
}

export async function PUT(request: NextRequest, deps: ProxyRouteDeps = {}) {
  const result = await resolveAuth(request, deps);
  if (result instanceof Response) return result;

  const body = await parseJsonBodyOrResponse<{
    proxyUrl?: string | null;
    allowInsecureTls?: boolean;
  }>(request);
  if (body instanceof Response) return body;

  const trimmed =
    typeof body.proxyUrl === "string" ? body.proxyUrl.trim() : null;
  const raw =
    trimmed && trimmed !== "null" && trimmed !== "undefined" ? trimmed : null;
  const allowInsecureTls =
    typeof body.allowInsecureTls === "boolean"
      ? body.allowInsecureTls
      : undefined;

  if (raw && raw.length > MAX_PROXY_URL_LENGTH) {
    logger.error("Proxy URL exceeds max length", {
      length: raw.length,
      max: MAX_PROXY_URL_LENGTH,
    });
    return unconfiguredResponse("Proxy URL too long");
  }

  let proxyUrl: string | null = null;
  if (raw) {
    const normalized = await normalizeProxyUrl(
      raw,
      result.detect,
      result.dnsCheck,
    );
    if (!normalized) {
      logger.error("Invalid proxy URL submitted", {
        raw: redactUrlForLogs(raw),
      });
      return unconfiguredResponse(
        "Invalid proxy URL. Accepted formats: http://host:port, socks5://host:port, or bare host:port",
      );
    }
    proxyUrl = normalized;
  }

  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({
      proxyUrl,
      ...(allowInsecureTls !== undefined && { allowInsecureTls }),
    })
    .where(eq(users.id, result.auth.userId))
    .returning({ allowInsecureTls: users.allowInsecureTls });

  const effectiveTls = updated?.allowInsecureTls ?? false;

  if (!proxyUrl) return unconfiguredResponse();
  return probeAndRespond(
    proxyUrl,
    result.probe,
    "Proxy saved but unreachable",
    effectiveTls,
  );
}
