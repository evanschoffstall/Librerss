import { Session, type SessionOptions } from "httpcloak";

import { stripUrlFragment } from "@/lib/utils/url";

export type ValidatedHttpCloakRequestFn = (
  url: URL,
  headers: Record<string, string>,
) => Promise<HttpCloakResponseLike>;

export interface ValidatedHttpCloakResponse {
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
  redirectHop: number;
  requestHeaders: Record<string, string>;
  statusCode: number;
}

interface HttpCloakResponseLike {
  body: Buffer | string;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
}

interface HttpCloakSessionLike {
  close: () => void;
  get: (
    url: string,
    options?: { headers?: Record<string, string>; timeout?: number },
  ) => Promise<HttpCloakResponseLike>;
}

interface RequestWithHttpCloakDeps {
  createSessionFn?: (options: SessionOptions) => HttpCloakSessionLike;
  requestFn?: ValidatedHttpCloakRequestFn;
}

interface RequestWithHttpCloakOptions {
  allowInsecureTls?: boolean;
  browserPreset?: string;
  headers: Record<string, string>;
  maxRedirects: number;
  proxyUrl?: string;
  timeoutMs: number;
  url: string;
  validateUrl: (url: string, isRedirectTarget: boolean) => Promise<void>;
}

export async function requestWithHttpCloakValidatedRedirects(
  options: RequestWithHttpCloakOptions,
  deps?: RequestWithHttpCloakDeps,
): Promise<ValidatedHttpCloakResponse> {
  let currentUrl = stripUrlFragment(options.url);
  const timeoutSeconds = Math.max(1, Math.ceil(options.timeoutMs / 1000));
  const session = deps?.requestFn
    ? null
    : (deps?.createSessionFn ?? createSession)({
        allowRedirects: false,
        maxRedirects: 0,
        preset: options.browserPreset ?? "chrome-latest",
        proxy: options.proxyUrl,
        retry: 0,
        timeout: timeoutSeconds,
        tlsOnly: true,
        verify: !(options.allowInsecureTls ?? false),
      });

  try {
    for (let redirectHop = 0; redirectHop <= options.maxRedirects; redirectHop += 1) {
      await options.validateUrl(currentUrl, redirectHop > 0);

      const requestHeaders = { ...options.headers };
      if (!deps?.requestFn && !session) {
        throw new Error("HTTPCloak session unavailable");
      }
      let response: HttpCloakResponseLike;
      if (deps?.requestFn) {
        response = await deps.requestFn(new URL(currentUrl), requestHeaders);
      } else if (session) {
        response = await session.get(currentUrl, {
          headers: requestHeaders,
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
      };
    }
  } finally {
    session?.close();
  }

  throw new Error("Too many redirects");
}

function createSession(options: SessionOptions): HttpCloakSessionLike {
  return new Session(options);
}

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