import { CONFIG } from "@/lib";
import { decodeHttpResponseBody, getSingleHeaderValue } from "@/lib/utils";
import {
  HttpCloakUpstreamError,
  requestWithHttpCloakValidatedRedirects,
  type ValidatedHttpCloakRequestFn,
} from "@/lib/utils/httpcloak";

import { assertPublicFeedUrl } from "./url-validator";

const MAX_FEED_REDIRECTS = 5;

export interface FeedUpstreamTransport {
  allowInsecureTls?: boolean;
  proxyUrl?: string;
}

interface FeedHttpDeps {
  assertPublicFeedUrlFn?: (url: string) => Promise<void>;
  httpCloakRequestFn?: ValidatedHttpCloakRequestFn;
}

/**
 * Fetch feed XML through HTTPCloak only, validating each redirect hop before
 * following it and rejecting non-success upstream responses directly.
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

function createFeedStageError(
  response: {
    headers: Record<string, string | string[] | undefined>;
    redirectHop: number;
    requestHeaders: Record<string, string>;
    statusCode: number;
  },
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

function isUrlValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Blocked URL" ||
      error.message === "Blocked redirect target")
  );
}
