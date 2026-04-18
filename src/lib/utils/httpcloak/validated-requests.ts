import { Session, type SessionOptions } from "httpcloak";
import dns from "node:dns/promises";
import net from "node:net";

import {
  isBlockedResolvedAddress,
  normalizeHostname,
  stripUrlFragment as stripUrlFragmentFromUrl,
} from "@/lib/utils";

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
 * Retains only the upstream headers that are useful for compatibility and
 * vendor compatibility diagnostics.
 * @param headers
 */
export function pickDiagnosticHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!headers) {
    return out;
  }

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

/**
 * @param proxyUrl
 */
export function promoteHttpCloakProxyUrl(
  proxyUrl: string | undefined,
): string | undefined {
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

/**
 * @param options
 * @param deps
 */
export async function requestWithHttpCloakValidatedRedirects(
  options: RequestWithHttpCloakOptions,
  deps?: RequestWithHttpCloakDeps,
): Promise<ValidatedHttpCloakResponse> {
  let currentUrl = stripUrlFragmentFromUrl(options.url);
  const transport = await resolveHttpCloakTransport(options, deps, currentUrl);

  try {
    for (
      let redirectHop = 0;
      redirectHop <= options.maxRedirects;
      redirectHop += 1
    ) {
      await options.validateUrl(currentUrl, redirectHop > 0);
      const { requestHeaders, response, responseHeaders } =
        await requestHttpCloakHop(currentUrl, deps, transport);

      if (response.statusCode >= 300 && response.statusCode < 400) {
        if (redirectHop === options.maxRedirects) {
          throw new Error("Too many redirects");
        }

        currentUrl = resolveRedirectTarget(responseHeaders, currentUrl);
        continue;
      }

      return toValidatedHttpCloakResponse(
        response,
        responseHeaders,
        redirectHop,
        requestHeaders,
      );
    }
  } finally {
    transport.session?.close();
  }

  throw new Error("Too many redirects");
}

/**
 * @param url
 * @param proxyUrl
 */
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

/**
 * @param options
 */
function createSession(options: SessionOptions): HttpCloakSessionLike {
  return new Session(options);
}

/**
 * @param currentUrl
 * @param requestHeaders
 * @param requestFn
 * @param session
 * @param timeoutSeconds
 */
async function executeHttpCloakRequest(
  currentUrl: string,
  requestHeaders: Record<string, string>,
  requestFn: undefined | ValidatedHttpCloakRequestFn,
  session: HttpCloakSessionLike | null,
  timeoutSeconds: number,
): Promise<HttpCloakResponseLike> {
  if (requestFn) {
    return requestFn(new URL(currentUrl), requestHeaders);
  }

  if (!session) {
    throw new Error("HTTPCloak session unavailable");
  }

  return session.get(currentUrl, {
    timeout: timeoutSeconds,
  });
}

/**
 * @param currentUrl
 * @param deps
 * @param transport
 * @param transport.session
 * @param transport.timeoutSeconds
 */
async function requestHttpCloakHop(
  currentUrl: string,
  deps: RequestWithHttpCloakDeps | undefined,
  transport: {
    session: HttpCloakSessionLike | null;
    timeoutSeconds: number;
  },
): Promise<{
  requestHeaders: Record<string, string>;
  response: HttpCloakResponseLike;
  responseHeaders: Record<string, string | string[] | undefined>;
}> {
  const requestHeaders: Record<string, string> = {};
  const response = await executeHttpCloakRequest(
    currentUrl,
    requestHeaders,
    deps?.requestFn,
    transport.session,
    transport.timeoutSeconds,
  );

  return {
    requestHeaders,
    response,
    responseHeaders: normalizeResponseHeaders(response.headers),
  };
}

/**
 * @param options
 * @param deps
 * @param url
 */
async function resolveHttpCloakTransport(
  options: RequestWithHttpCloakOptions,
  deps: RequestWithHttpCloakDeps | undefined,
  url: string,
): Promise<{
  session: HttpCloakSessionLike | null;
  timeoutSeconds: number;
}> {
  const timeoutSeconds = Math.max(1, Math.ceil(options.timeoutMs / 1000));
  const proxyUrl = promoteHttpCloakProxyUrl(options.proxyUrl);
  if (deps?.requestFn) {
    return { session: null, timeoutSeconds };
  }

  const connectTo = await (
    deps?.resolveConnectToFn ?? resolveHttpCloakConnectTo
  )(url, proxyUrl);

  return {
    session: (deps?.createSessionFn ?? createSession)({
      allowRedirects: false,
      ...(connectTo ? { connectTo } : {}),
      maxRedirects: 0,
      preset: options.browserPreset ?? "chrome-latest",
      proxy: proxyUrl,
      retry: 0,
      timeout: timeoutSeconds,
      verify: !(options.allowInsecureTls ?? false),
    }),
    timeoutSeconds,
  };
}

/**
 * @param responseHeaders
 * @param currentUrl
 */
function resolveRedirectTarget(
  responseHeaders: Record<string, string | string[] | undefined>,
  currentUrl: string,
): string {
  const locationHeader = responseHeaders.location;
  const location = Array.isArray(locationHeader)
    ? locationHeader[0]
    : locationHeader;

  if (typeof location !== "string" || !location.trim()) {
    throw new Error("Redirect without Location header");
  }

  return stripUrlFragmentFromUrl(new URL(location, currentUrl).toString());
}

/**
 * @param response
 * @param responseHeaders
 * @param redirectHop
 * @param requestHeaders
 */
function toValidatedHttpCloakResponse(
  response: HttpCloakResponseLike,
  responseHeaders: Record<string, string | string[] | undefined>,
  redirectHop: number,
  requestHeaders: Record<string, string>,
): ValidatedHttpCloakResponse {
  return {
    body: toBuffer(response.body),
    headers: responseHeaders,
    redirectHop,
    requestHeaders,
    statusCode: response.statusCode,
    text: typeof response.text === "string" ? response.text : undefined,
  };
}

export const SOCKS_PROTOCOLS = new Set([
  "socks4:",
  "socks4a:",
  "socks5:",
  "socks5h:",
  "socks:",
]);

/**
 * @param headers
 */
function normalizeResponseHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const normalized: Record<string, string | string[] | undefined> = {};

  for (const [name, value] of Object.entries(headers)) {
    normalized[name.toLowerCase()] = value;
  }

  return normalized;
}

/**
 * @param data
 */
function toBuffer(data: Buffer | string): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  return Buffer.from(data, "latin1");
}
