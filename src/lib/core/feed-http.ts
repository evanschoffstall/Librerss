/**
 * SSRF-safe HTTP fetching for RSS feed XML.
 */

import { CONFIG } from "@/lib/config";
import { decodeTextBody } from "@/lib/utils/content-encoding";
import {
  HttpCloakUpstreamError,
  requestWithHttpCloakValidatedRedirects,
  type ValidatedHttpCloakRequestFn,
} from "@/lib/utils/httpcloak";

import { assertPublicFeedUrl } from "./feed-url-validator";

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

    const decodedBody =
      typeof response.text === "string"
        ? response.text
        : await decodeTextBody(
            response.body,
            getSingleHeaderValue(response.headers, "content-encoding"),
            { maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES },
          );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw createFeedStageError(
        response,
        decodedBody,
        transport,
      );
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
  const xDataDome = response.headers["x-datadome"];
  const dataDomeHeader =
    typeof xDataDome === "string"
      ? xDataDome.toLowerCase()
      : Array.isArray(xDataDome)
        ? xDataDome.join(";").toLowerCase()
        : "";

  const message =
    response.statusCode === 403 && dataDomeHeader === "protected"
      ? "Upstream request received a vendor access response (DataDome) [HTTP 403]"
      : `Upstream responded with status ${response.statusCode}`;

  return new HttpCloakUpstreamError(
    response.statusCode,
    responseBody,
    transport?.proxyUrl ? "proxy" : "direct",
    transport?.proxyUrl ?? null,
    transport?.allowInsecureTls ?? false,
    response.redirectHop,
    response.headers,
    response.requestHeaders,
    message,
  );
}

function getSingleHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function isUrlValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Blocked URL" ||
      error.message === "Blocked redirect target")
  );
}
