import { CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";
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
 * Fetch article HTML through HTTPCloak using the shared transport request
 * profile and SSRF-safe redirect validation.
 */
export async function fetchHtmlWithHttpCloak(
  url: string,
  isAllowedUrl: (candidateUrl: string) => Promise<boolean>,
  options?: HttpCloakFetchOptions,
  deps?: HttpCloakFetchDeps,
): Promise<{
  html: string;
  requestHeaders: Record<string, string>;
}> {
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

  logger.info("HTTPCloak upstream response", {
    diagnosticHeaders: pickDiagnosticHeaders(response.headers),
    proxyMode,
    redirectHop: response.redirectHop,
    statusCode: response.statusCode,
    url,
  });

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
    html: decodedBody,
    requestHeaders: response.requestHeaders,
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