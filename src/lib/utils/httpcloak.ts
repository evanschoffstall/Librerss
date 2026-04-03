import { Session, type SessionOptions } from "httpcloak";
import dns from "node:dns/promises";
import net from "node:net";

import {
  isBlockedResolvedAddress,
  normalizeHostname,
} from "@/lib/utils/ssrf";
import { stripUrlFragment } from "@/lib/utils/url";

export type ValidatedHttpCloakRequestFn = (
  url: URL,
  requestHeaders: Record<string, string>,
) => Promise<HttpCloakResponseLike>;

export interface ValidatedHttpCloakResponse {
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
  redirectHop: number;
  requestHeaders: Record<string, string>;
  statusCode: number;
  text?: string;
}

interface HttpCloakResponseLike {
  body: Buffer | string;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
  text?: string;
}

interface HttpCloakSessionLike {
  close: () => void;
  get: (
    url: string,
    options?: { timeout?: number },
  ) => Promise<HttpCloakResponseLike>;
}

interface RequestWithHttpCloakDeps {
  createSessionFn?: (options: SessionOptions) => HttpCloakSessionLike;
  requestFn?: ValidatedHttpCloakRequestFn;
  resolveConnectToFn?: (
    url: string,
    proxyUrl: string | undefined,
  ) => Promise<Record<string, string> | undefined>;
}

interface RequestWithHttpCloakOptions {
  allowInsecureTls?: boolean;
  browserPreset?: string;
  maxRedirects: number;
  proxyUrl?: string;
  timeoutMs: number;
  url: string;
  validateUrl: (url: string, isRedirectTarget: boolean) => Promise<void>;
}

/**
 * Captures a non-success upstream response returned through the HTTPCloak
 * transport together with the metadata needed for diagnostics.
 */
export class HttpCloakUpstreamError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: string,
    readonly proxyMode: string,
    readonly proxyAddress: null | string,
    readonly allowInsecureTls: boolean,
    readonly redirectHop: number,
    readonly responseHeaders: Record<string, string | string[] | undefined>,
    readonly requestHeaders: Record<string, string>,
    message = `Upstream responded with status ${statusCode}`,
  ) {
    super(message);
    this.name = "HttpCloakUpstreamError";
  }
}

/**
 * Retains only the upstream headers that are useful for compatibility and
 * vendor compatibility diagnostics.
 */
export function pickDiagnosticHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keep = new Set([
    "cf-ray",
    "content-type",
    "retry-after",
    "server",
    "via",
    "x-cache",
    "x-datadome",
  ]);

  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (keep.has(lower) || lower.startsWith("x-px-")) {
      out[lower] = value;
    }
  }

  const setCookie = headers["set-cookie"];
  const setCookieCount = Array.isArray(setCookie)
    ? setCookie.length
    : setCookie
      ? 1
      : 0;
  if (setCookieCount > 0) {
    out["set-cookie-count"] = setCookieCount;
  }

  return out;
}

export function promoteHttpCloakProxyUrl(proxyUrl: string | undefined):
  | string
  | undefined {
  if (!proxyUrl) {
    return proxyUrl;
  }

  try {
    const parsed = new URL(proxyUrl);

    if (parsed.protocol === "socks:" || parsed.protocol === "socks5:") {
      parsed.protocol = "socks5h:";
      return parsed.toString();
    }

    if (parsed.protocol === "socks4:") {
      parsed.protocol = "socks4a:";
      return parsed.toString();
    }
  } catch {
    return proxyUrl;
  }

  return proxyUrl;
}

export async function requestWithHttpCloakValidatedRedirects(
  options: RequestWithHttpCloakOptions,
  deps?: RequestWithHttpCloakDeps,
): Promise<ValidatedHttpCloakResponse> {
  let currentUrl = stripUrlFragment(options.url);
  const timeoutSeconds = Math.max(1, Math.ceil(options.timeoutMs / 1000));
  const proxyUrl = promoteHttpCloakProxyUrl(options.proxyUrl);
  const connectTo = deps?.requestFn
    ? undefined
    : await (deps?.resolveConnectToFn ?? resolveHttpCloakConnectTo)(
        currentUrl,
        proxyUrl,
      );
  const session = deps?.requestFn
    ? null
    : (deps?.createSessionFn ?? createSession)({
        allowRedirects: false,
        ...(connectTo ? { connectTo } : {}),
        maxRedirects: 0,
        preset: options.browserPreset ?? "chrome-latest",
        proxy: proxyUrl,
        retry: 0,
        timeout: timeoutSeconds,
        verify: !(options.allowInsecureTls ?? false),
      });

  try {
    for (let redirectHop = 0; redirectHop <= options.maxRedirects; redirectHop += 1) {
      await options.validateUrl(currentUrl, redirectHop > 0);
      const requestHeaders: Record<string, string> = {};

      if (!deps?.requestFn && !session) {
        throw new Error("HTTPCloak session unavailable");
      }
      let response: HttpCloakResponseLike;
      if (deps?.requestFn) {
        response = await deps.requestFn(new URL(currentUrl), requestHeaders);
      } else if (session) {
        response = await session.get(currentUrl, {
          timeout: timeoutSeconds,
        });
      } else {
        throw new Error("HTTPCloak session unavailable");
      }

      const responseHeaders = normalizeResponseHeaders(response.headers);

      if (response.statusCode >= 300 && response.statusCode < 400) {
        if (redirectHop === options.maxRedirects) {
          throw new Error("Too many redirects");
        }

        const locationHeader = responseHeaders.location;
        const location = Array.isArray(locationHeader)
          ? locationHeader[0]
          : locationHeader;

        if (typeof location !== "string" || !location.trim()) {
          throw new Error("Redirect without Location header");
        }

        currentUrl = stripUrlFragment(new URL(location, currentUrl).toString());
        continue;
      }

      return {
        body: toBuffer(response.body),
        headers: responseHeaders,
        redirectHop,
        requestHeaders,
        statusCode: response.statusCode,
        text: typeof response.text === "string" ? response.text : undefined,
      };
    }
  } finally {
    session?.close();
  }

  throw new Error("Too many redirects");
}

export async function resolveHttpCloakConnectTo(
  url: string,
  proxyUrl: string | undefined,
): Promise<Record<string, string> | undefined> {
  const promotedProxyUrl = promoteHttpCloakProxyUrl(proxyUrl);
  if (!promotedProxyUrl) {
    return undefined;
  }

  let proxyProtocol: string;
  let hostname: string;
  try {
    proxyProtocol = new URL(promotedProxyUrl).protocol;
    hostname = new URL(url).hostname;
  } catch {
    return undefined;
  }

  if (!SOCKS_PROTOCOLS.has(proxyProtocol)) {
    return undefined;
  }

  const normalizedHostname = normalizeHostname(hostname);
  if (net.isIP(normalizedHostname) !== 0) {
    return undefined;
  }

  try {
    const { address } = await dns.lookup(normalizedHostname, { family: 4 });
    if (isBlockedResolvedAddress(address)) {
      return undefined;
    }

    return { [normalizedHostname]: address };
  } catch {
    return undefined;
  }
}

function createSession(options: SessionOptions): HttpCloakSessionLike {
  return new Session(options);
}

export const SOCKS_PROTOCOLS = new Set([
  "socks4:",
  "socks4a:",
  "socks5:",
  "socks5h:",
  "socks:",
]);

function normalizeResponseHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const normalized: Record<string, string | string[] | undefined> = {};

  for (const [name, value] of Object.entries(headers)) {
    normalized[name.toLowerCase()] = value;
  }

  return normalized;
}

function toBuffer(data: Buffer   | string): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  return Buffer.from(data, "latin1");
}