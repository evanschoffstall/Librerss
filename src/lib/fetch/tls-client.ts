import { promises as dns } from "dns";

import { logger } from "@/lib/logger";

let tlsReady: boolean | null = null;

interface WrapperModuleClient {
  open: () => Promise<void>;
}

interface WrapperSessionClient {
  destroySession: () => Promise<unknown>;
  get: (
    url: string,
    options?: {
      followRedirects?: boolean;
      headers?: Record<string, string>;
      requestHostOverride?: string;
    },
  ) => Promise<{
    body: string;
    headers: Record<string, string>;
    status: number;
  }>;
}

let moduleClient: null | WrapperModuleClient = null;

const MAX_SOCKS_ROUTE_ENTRIES = 500;
const MAX_FALLBACK_WARNING_ENTRIES = 100;

const globalForFetch = globalThis as unknown as {
  socksFallbackWarningEmitted?: Set<string>;
  socksRoutePreference?: Map<string, "hostname" | "ip">;
};

const socksRoutePreference =
  globalForFetch.socksRoutePreference || new Map<string, "hostname" | "ip">();
const socksFallbackWarningEmitted =
  globalForFetch.socksFallbackWarningEmitted || new Set<string>();

globalForFetch.socksRoutePreference = socksRoutePreference;
globalForFetch.socksFallbackWarningEmitted = socksFallbackWarningEmitted;

interface RawResponse {
  body: string;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
}

export async function ensureTlsClient(): Promise<boolean> {
  if (tlsReady !== null) return tlsReady;

  try {
    const { ModuleClient } = (await import("tlsclientwrapper")) as unknown as {
      ModuleClient: new () => WrapperModuleClient;
    };
    moduleClient = new ModuleClient();
    await moduleClient.open();
    tlsReady = true;
    logger.info("tlsclientwrapper initialized (bogdanfinn TLS backend active)");
    return true;
  } catch (err) {
    tlsReady = false;
    logger.error("TLS client failed to initialize", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function tlsClientFetch(
  url: URL,
  headers: Record<string, string>,
  proxyUrl: string | undefined,
  allowInsecureTls: boolean,
  timeoutMs: number,
): Promise<RawResponse> {
  const sanitizedProxyUrl =
    proxyUrl && proxyUrl !== "null" && proxyUrl !== "undefined"
      ? proxyUrl
      : undefined;

  const request = async (
    targetUrl: string,
    serverNameOverwrite?: string,
    hostOverride?: string,
  ): Promise<RawResponse> => {
    if (!moduleClient) {
      throw new Error("TLS client not initialized");
    }

    const { SessionClient } = (await import("tlsclientwrapper")) as unknown as {
      SessionClient: new (
        moduleClient: WrapperModuleClient,
        options?: Record<string, unknown>,
      ) => WrapperSessionClient;
    };

    const session = new SessionClient(moduleClient, {
      followRedirects: false,
      insecureSkipVerify: allowInsecureTls,
      timeoutMilliseconds: timeoutMs,
      timeoutSeconds: undefined,
      tlsClientIdentifier: "chrome_131",
      withDefaultCookieJar: true,
      ...(sanitizedProxyUrl ? { proxyUrl: sanitizedProxyUrl } : {}),
      ...(serverNameOverwrite ? { serverNameOverwrite } : {}),
    });

    try {
      const resp = await session.get(targetUrl, {
        followRedirects: false,
        headers,
        ...(hostOverride ? { requestHostOverride: hostOverride } : {}),
      });
      return {
        body: resp.body,
        headers: flattenHeaders(resp.headers),
        statusCode: resp.status,
      };
    } catch (err) {
      return {
        body: err instanceof Error ? err.message : String(err),
        headers: {},
        statusCode: 0,
      };
    } finally {
      await session.destroySession().catch(() => {
        // Session already closed or init incomplete — ignore.
      });
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
        boundedMapSet(
          socksRoutePreference,
          routeKey,
          "hostname",
          MAX_SOCKS_ROUTE_ENTRIES,
        );
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
      boundedSetAdd(
        socksFallbackWarningEmitted,
        routeKey,
        MAX_FALLBACK_WARNING_ENTRIES,
      );
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
    if (fallback.statusCode !== 0) {
      boundedMapSet(
        socksRoutePreference,
        routeKey,
        "ip",
        MAX_SOCKS_ROUTE_ENTRIES,
      );
    }
    return fallback.statusCode === 0 ? primary : fallback;
  } catch (err) {
    logger.warn("DNS resolution failed for SOCKS proxy fallback", {
      error: err instanceof Error ? err.message : String(err),
      hostname,
    });
    return primary;
  }
}

function boundedMapSet<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  maxSize: number,
): void {
  if (map.size >= maxSize && !map.has(key)) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

function boundedSetAdd<T>(set: Set<T>, value: T, maxSize: number): void {
  if (set.size >= maxSize && !set.has(value)) {
    const firstValue = set.values().next().value;
    if (firstValue !== undefined) set.delete(firstValue);
  }
  set.add(value);
}

function flattenHeaders(
  src: null | Record<string, string | string[] | undefined> | undefined,
): Record<string, string | string[] | undefined> {
  if (!src) return {};
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(src))
    out[k.toLowerCase()] = Array.isArray(v) && v.length === 1 ? v[0] : v;
  return out;
}

function socksRouteKey(proxyUrl: string | undefined, hostname: string): string {
  if (!proxyUrl) return hostname;
  try {
    const parsed = new URL(proxyUrl);
    return `${parsed.protocol}//${parsed.host}|${hostname}`;
  } catch {
    return `${proxyUrl}|${hostname}`;
  }
}
