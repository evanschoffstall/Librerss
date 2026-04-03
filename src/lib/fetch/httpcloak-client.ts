import { CONFIG } from "@/lib/config";
import { decodeTextBody } from "@/lib/utils/content-encoding";
import {
  HttpCloakUpstreamError,
  pickDiagnosticHeaders,
  requestWithHttpCloakValidatedRedirects,
  type ValidatedHttpCloakRequestFn,
} from "@/lib/utils/httpcloak";

interface HttpCloakFetchDeps {
  requestFn?: ValidatedHttpCloakRequestFn;
}

interface HttpCloakFetchOptions {
  allowInsecureTls?: boolean;
  proxyUrl?: string;
}

/**
 * Carries the decoded HTML plus the upstream metadata that higher-level
 * extract stages use for a single canonical success log entry.
 */
interface HttpCloakFetchResult {
  diagnosticHeaders?: ReturnType<typeof pickDiagnosticHeaders>;
  html: string;
  redirectHop?: number;
  requestHeaders: Record<string, string>;
  statusCode?: number;
}

/**
 * Fetch article HTML through HTTPCloak using the shared transport request
 * profile and SSRF-safe redirect validation.
 */
export async function fetchHtmlWithHttpCloak(
  url: string,
  isAllowedUrl: (candidateUrl: string) => Promise<boolean>,
  options?: HttpCloakFetchOptions,
  deps?: HttpCloakFetchDeps,
): Promise<HttpCloakFetchResult> {
  const proxyMode = options?.proxyUrl ? "proxy" : "direct";
  const allowInsecureTls = options?.allowInsecureTls ?? false;
  const response = await requestWithHttpCloakValidatedRedirects(
    {
      allowInsecureTls,
      browserPreset: "chrome-latest",
      maxRedirects: 5,
      proxyUrl: options?.proxyUrl,
      timeoutMs: 25_000,
      url,
      validateUrl: async (candidateUrl, isRedirectTarget) => {
        if (!(await isAllowedUrl(candidateUrl))) {
          throw new Error(
            isRedirectTarget ? "Blocked redirect target" : "Blocked URL",
          );
        }
      },
    },
    { requestFn: deps?.requestFn },
  );

  const decodedBody = await decodeResponseBody(response);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new HttpCloakUpstreamError(
      response.statusCode,
      decodedBody,
      proxyMode,
      options?.proxyUrl ?? null,
      allowInsecureTls,
      response.redirectHop,
      response.headers,
      response.requestHeaders,
    );
  }

  if (
    Buffer.byteLength(decodedBody, "utf8") >
    CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES
  ) {
    throw new Error("Upstream response too large");
  }

  return {
    diagnosticHeaders: pickDiagnosticHeaders(response.headers),
    html: decodedBody,
    redirectHop: response.redirectHop,
    requestHeaders: response.requestHeaders,
    statusCode: response.statusCode,
  };
}

async function decodeResponseBody(
  response: {
    body: Buffer | string;
    headers: Record<string, string | string[] | undefined>;
    text?: string;
  },
): Promise<string> {
  if (typeof response.text === "string") {
    return response.text;
  }

  return decodeTextBody(
    Buffer.isBuffer(response.body)
      ? response.body
      : Buffer.from(response.body, "latin1"),
    getSingleHeaderValue(response.headers, "content-encoding"),
    { maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES },
  );
}

function getSingleHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  headerName: string,
): string | undefined {
  const match = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === headerName,
  )?.[1];

  return Array.isArray(match) ? match[0] : match;
}