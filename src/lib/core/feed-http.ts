/**
 * SSRF-safe HTTP fetching for RSS feed XML.
 */

import { CONFIG } from "@/lib/config";
import { decodeTextBody } from "@/lib/utils/content-encoding";
import {
  requestWithHttpCloakValidatedRedirects,
  type ValidatedHttpCloakRequestFn,
} from "@/lib/utils/httpcloak";

import { assertPublicFeedUrl } from "./feed-url-validator";

const MAX_FEED_REDIRECTS = 5;

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
): Promise<string> {
  const assertUrl = deps?.assertPublicFeedUrlFn ?? assertPublicFeedUrl;

  try {
    const response = await requestWithHttpCloakValidatedRedirects(
      {
        headers: {},
        maxRedirects: MAX_FEED_REDIRECTS,
        timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
        url,
        validateUrl: async (candidateUrl) => {
          await assertUrl(candidateUrl);
        },
      },
      { requestFn: deps?.httpCloakRequestFn },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw createFeedStageError(response.statusCode, response.headers);
    }

    return await decodeTextBody(
      response.body,
      getSingleHeaderValue(response.headers, "content-encoding"),
      { maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES },
    );
  } catch (error) {
    if (isUrlValidationError(error) || error instanceof Error) {
      throw error;
    }

    throw new Error("Upstream request failed", { cause: error });
  }
}

function createFeedStageError(
  statusCode: number,
  headers?: Record<string, unknown>,
): Error {
  const xDataDome = headers?.["x-datadome"];
  const dataDomeHeader =
    typeof xDataDome === "string" ? xDataDome.toLowerCase() : "";

  if (statusCode === 403 && dataDomeHeader === "protected") {
    return new Error(
      "Upstream request received a vendor access response (DataDome) [HTTP 403]",
    );
  }

  return new Error(`Upstream responded with status ${statusCode}`);
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
