import { CONFIG } from "@/lib";
import { decodeHttpResponseBody } from "@/lib/utils";
import {
  HttpCloakUpstreamError,
  pickDiagnosticHeaders,
  requestWithHttpCloakValidatedRedirects,
  type ValidatedHttpCloakRequestFn,
} from "@/lib/utils/httpcloak";

interface AssertSuccessfulHttpCloakResponseOptions {
  allowInsecureTls: boolean;
  decodedBody: string;
  proxyAddress: null | string;
  proxyMode: "direct" | "proxy";
  response: Awaited<ReturnType<typeof requestWithHttpCloakValidatedRedirects>>;
}

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
 * Process the fetch html with http cloak.
 * @param url - The url.
 * @param isAllowedUrl - Whether is allowed url.
 * @param options - The options used to process the fetch html with http cloak.
 * @param deps - The deps.
 * @returns The fetch html with http cloak.
 */
export async function fetchHtmlWithHttpCloak(
  url: string,
  isAllowedUrl: (candidateUrl: string) => Promise<boolean>,
  options?: HttpCloakFetchOptions,
  deps?: HttpCloakFetchDeps,
): Promise<HttpCloakFetchResult> {
  const proxyMode = options?.proxyUrl ? "proxy" : "direct";
  const allowInsecureTls = options?.allowInsecureTls ?? false;
  const response = await requestHttpCloakResponse(
    url,
    isAllowedUrl,
    options,
    deps,
    allowInsecureTls,
  );

  const decodedBody = await decodeHttpResponseBody(response, {
    maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
  });

  assertSuccessfulHttpCloakResponse({
    allowInsecureTls,
    decodedBody,
    proxyAddress: options?.proxyUrl ?? null,
    proxyMode,
    response,
  });

  return {
    diagnosticHeaders: pickDiagnosticHeaders(response.headers),
    html: decodedBody,
    redirectHop: response.redirectHop,
    requestHeaders: response.requestHeaders,
    statusCode: response.statusCode,
  };
}

/**
 * Process the assert successful http cloak response.
 * @param options - The options used to process the assert successful http cloak response.
 */
function assertSuccessfulHttpCloakResponse(
  options: AssertSuccessfulHttpCloakResponseOptions,
) {
  const { allowInsecureTls, decodedBody, proxyAddress, proxyMode, response } =
    options;
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new HttpCloakUpstreamError({
      allowInsecureTls,
      proxyAddress,
      proxyMode,
      redirectHop: response.redirectHop,
      requestHeaders: response.requestHeaders,
      responseBody: decodedBody,
      responseHeaders: response.headers,
      statusCode: response.statusCode,
    });
  }

  if (
    Buffer.byteLength(decodedBody, "utf8") > CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES
  ) {
    throw new Error("Upstream response too large");
  }
}

/**
 * Process the request http cloak response.
 * @param url - The url.
 * @param isAllowedUrl - Whether is allowed url.
 * @param options - The options used to process the request http cloak response.
 * @param deps - The deps.
 * @param allowInsecureTls - The allow insecure tls.
 * @returns The request http cloak response.
 */
async function requestHttpCloakResponse(
  url: string,
  isAllowedUrl: (candidateUrl: string) => Promise<boolean>,
  options: HttpCloakFetchOptions | undefined,
  deps: HttpCloakFetchDeps | undefined,
  allowInsecureTls: boolean,
) {
  return requestWithHttpCloakValidatedRedirects(
    {
      allowInsecureTls,
      browserPreset: "chrome-latest",
      maxRedirects: 5,
      proxyUrl: options?.proxyUrl,
      timeoutMs: 25_000,
      url,
      /**
       * Process the validate url.
       * @param candidateUrl - The candidate url.
       * @param isRedirectTarget - Whether is redirect target.
       */
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
}
