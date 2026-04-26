import { CONFIG } from "@/lib";
import { decodeHttpResponseBody, getSingleHeaderValue } from "@/lib/utils";
import {
  HttpCloakUpstreamError,
  requestWithHttpCloakValidatedRedirects,
  type ValidatedHttpCloakRequestFn,
} from "@/lib/utils/httpcloak";

import { assertPublicFeedUrl } from "./url-validator";

const MAX_FEED_REDIRECTS = 5;

/**
 * Describes the feed upstream transport.
 */
export interface FeedUpstreamTransport {
  allowInsecureTls?: boolean;
  proxyUrl?: string;
}

/**
 * Describes the feed HTTP deps.
 */
interface FeedHttpDeps {
  assertPublicFeedUrlFn?: (url: string) => Promise<void>;
  httpCloakRequestFn?: ValidatedHttpCloakRequestFn;
}

/**
 * Describes the feed stage error response.
 */
interface FeedStageErrorResponse {
  headers: Record<string, string | string[] | undefined>;
  redirectHop: number;
  requestHeaders: Record<string, string>;
  statusCode: number;
}
/**
 * Process the fetch feed xml.
 * @param url - The url.
 * @param deps - The deps.
 * @param transport - The transport.
 * @returns The fetch feed xml.
 */
export async function fetchFeedXml(
  url: string,
  deps?: FeedHttpDeps,
  transport?: FeedUpstreamTransport,
): Promise<string> {
  const assertUrl = deps?.assertPublicFeedUrlFn ?? assertPublicFeedUrl;

  try {
    const response = await requestWithHttpCloakValidatedRedirects(
      {
        allowInsecureTls: transport?.allowInsecureTls ?? false,
        maxRedirects: MAX_FEED_REDIRECTS,
        proxyUrl: transport?.proxyUrl,
        timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
        url,
        /**
         * Process the validate url.
         * @param candidateUrl - The candidate url.
         */
        validateUrl: async (candidateUrl) => {
          await assertUrl(candidateUrl);
        },
      },
      { requestFn: deps?.httpCloakRequestFn },
    );

    const decodedBody = await decodeHttpResponseBody(response, {
      maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw createFeedStageError(response, decodedBody, transport);
    }

    return decodedBody;
  } catch (error) {
    if (isUrlValidationError(error) || error instanceof Error) {
      throw error;
    }

    throw new Error("Upstream request failed", { cause: error });
  }
}

/**
 * Create the feed stage error.
 * @param response - The response.
 * @param responseBody - The response body.
 * @param transport - The transport.
 * @returns The feed stage error.
 */
function createFeedStageError(
  response: FeedStageErrorResponse,
  responseBody: string,
  transport?: FeedUpstreamTransport,
): Error {
  const dataDomeHeader =
    getSingleHeaderValue(response.headers, "x-datadome")?.toLowerCase() ?? "";

  const message =
    response.statusCode === 403 && dataDomeHeader === "protected"
      ? "Upstream request received a vendor access response (DataDome) [HTTP 403]"
      : `Upstream responded with status ${response.statusCode}`;

  return new HttpCloakUpstreamError(
    {
      allowInsecureTls: transport?.allowInsecureTls ?? false,
      proxyAddress: transport?.proxyUrl ?? null,
      proxyMode: transport?.proxyUrl ? "proxy" : "direct",
      redirectHop: response.redirectHop,
      requestHeaders: response.requestHeaders,
      responseBody,
      responseHeaders: response.headers,
      statusCode: response.statusCode,
    },
    message,
  );
}

/**
 * Return whether is url validation error.
 * @param error - The error.
 * @returns Whether is url validation error.
 */
function isUrlValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Blocked URL" ||
      error.message === "Blocked redirect target")
  );
}
