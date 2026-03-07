import { logger } from "@/lib/logger";
import { promises as dns } from "dns";

let tlsReady: boolean | null = null;
const globalForFetch = globalThis as unknown as {
  socksRoutePreference?: Map<string, "hostname" | "ip">;
  socksFallbackWarningEmitted?: Set<string>;
};

const socksRoutePreference =
  globalForFetch.socksRoutePreference || new Map<string, "hostname" | "ip">();
const socksFallbackWarningEmitted =
  globalForFetch.socksFallbackWarningEmitted || new Set<string>();

globalForFetch.socksRoutePreference = socksRoutePreference;
globalForFetch.socksFallbackWarningEmitted = socksFallbackWarningEmitted;

function socksRouteKey(proxyUrl: string | undefined, hostname: string): string {
  if (!proxyUrl) return hostname;
  try {
    const parsed = new URL(proxyUrl);
    return `${parsed.protocol}//${parsed.host}|${hostname}`;
  } catch {
    return `${proxyUrl}|${hostname}`;
  }
}

export async function ensureTlsClient(): Promise<boolean> {
  if (tlsReady !== null) return tlsReady;
  try {
    const { initTLS } = await import("node-tls-client");
    await initTLS();
    tlsReady = true;
    logger.info("node-tls-client initialized (uTLS fingerprint active)");
  } catch (err) {
    tlsReady = false;
    logger.error("node-tls-client init failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return tlsReady;
}

function flattenHeaders(
  src: Record<string, string | string[] | undefined> | null | undefined,
): Record<string, string | string[] | undefined> {
  if (!src) return {};
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(src))
    out[k.toLowerCase()] = Array.isArray(v) && v.length === 1 ? v[0] : v;
  return out;
}

interface RawResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export async function tlsClientFetch(
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

  const request = async (
    targetUrl: string,
    serverNameOverwrite?: string,
    hostOverride?: string,
  ): Promise<RawResponse> => {
    const session = new Session({
      clientIdentifier: ClientIdentifier.chrome_131,
      timeout: timeoutMs,
      insecureSkipVerify: allowInsecureTls,
      ...(sanitizedProxyUrl ? { proxy: sanitizedProxyUrl } : {}),
      ...(serverNameOverwrite ? { serverNameOverwrite } : {}),
    });

    try {
      const resp = await session.get(targetUrl, {
        headers: headers as Record<string, string | string[]>,
        followRedirects: false,
        ...(hostOverride ? { hostOverride } : {}),
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
  };

  const targetUrl = url.toString();
  const isSocksProxy = sanitizedProxyUrl?.startsWith("socks");
  const hostname = url.hostname;
  const isIpHost =
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    hostname.startsWith("[");
  const routeKey = socksRouteKey(sanitizedProxyUrl, hostname);
  const preferredRoute = socksRoutePreference.get(routeKey) ?? "hostname";

  const resolvedIpPromise =
    isSocksProxy && !isIpHost
      ? dns
          .resolve4(hostname)
          .then(([ip]) => ip)
          .catch(() => undefined)
      : Promise.resolve(undefined);

  if (isSocksProxy && !isIpHost && preferredRoute === "ip") {
    const ip = await resolvedIpPromise;
    if (ip) {
      const primaryIp = await request(
        targetUrl.replace(hostname, ip),
        hostname,
        hostname,
      );
      if (primaryIp.statusCode !== 0) return primaryIp;
      const hostnameFallback = await request(targetUrl);
      if (hostnameFallback.statusCode !== 0) {
        socksRoutePreference.set(routeKey, "hostname");
        return hostnameFallback;
      }
      return primaryIp;
    }
  }

  const primary = await request(targetUrl);
  if (!isSocksProxy || isIpHost || primary.statusCode !== 0) return primary;

  try {
    const ip = await resolvedIpPromise;
    if (!ip) return primary;
    logger.info("Resolved hostname for SOCKS proxy fallback", { hostname, ip });
    if (!socksFallbackWarningEmitted.has(routeKey)) {
      socksFallbackWarningEmitted.add(routeKey);
      logger.warn(
        "SOCKS hostname request failed, retrying with resolved IPv4",
        {
          hostname,
          proxyUrl: sanitizedProxyUrl,
        },
      );
    }
    const fallback = await request(
      targetUrl.replace(hostname, ip),
      hostname,
      hostname,
    );
    if (fallback.statusCode !== 0) socksRoutePreference.set(routeKey, "ip");
    return fallback.statusCode === 0 ? primary : fallback;
  } catch (err) {
    logger.warn("DNS resolution failed for SOCKS proxy fallback", {
      hostname,
      error: err instanceof Error ? err.message : String(err),
    });
    return primary;
  }
}
