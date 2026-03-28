/**
 * SSRF-safe HTTP fetching for RSS feed XML.
 */

import axios from "axios";

import { CONFIG } from "@/lib/config";
import { decodeTextBody } from "@/lib/utils/content-encoding";
import {
  requestWithHttpCloakValidatedRedirects,
  type ValidatedHttpCloakRequestFn,
} from "@/lib/utils/httpcloak";

import { assertPublicFeedUrl } from "./feed-url-validator";
import { fetchTextWithValidatedRedirects } from "./upstream-http";

const MAX_FEED_REDIRECTS = 5;

interface FeedHttpDeps {
  assertPublicFeedUrlFn?: (url: string) => Promise<void>;
  axiosGetFn?: typeof axios.get;
  httpCloakRequestFn?: ValidatedHttpCloakRequestFn;
  isAxiosErrorFn?: typeof axios.isAxiosError;
}

export async function fetchFeedXml(
  url: string,
  deps?: FeedHttpDeps,
): Promise<string> {
  const assertUrl = deps?.assertPublicFeedUrlFn ?? assertPublicFeedUrl;
  const requestHeaders = {
    Accept: CONFIG.FEED_REQUEST_ACCEPT,
    "Accept-Language": "en-US,en;q=0.8",
    "User-Agent": CONFIG.FEED_REQUEST_USER_AGENT,
  };

  const skipHttpCloakStage =
    deps?.axiosGetFn !== undefined && deps.httpCloakRequestFn === undefined;
  let preferredError: Error | undefined;

  if (!skipHttpCloakStage) {
    try {
      const response = await requestWithHttpCloakValidatedRedirects(
        {
          headers: requestHeaders,
          maxRedirects: MAX_FEED_REDIRECTS,
          timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
          url,
          validateUrl: async (candidateUrl) => {
            await assertUrl(candidateUrl);
          },
        },
        { requestFn: deps?.httpCloakRequestFn },
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return await decodeTextBody(
          response.body,
          getSingleHeaderValue(response.headers, "content-encoding"),
          { maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES },
        );
      }

      preferredError = createFeedStageError(
        response.statusCode,
        response.headers,
      );
    } catch (error) {
      if (isUrlValidationError(error)) {
        throw error;
      }

      preferredError = error instanceof Error ? error : undefined;
    }
  }

  try {
    return await fetchTextWithValidatedRedirects(
      {
        assertAllowedUrl: assertUrl,
        headers: requestHeaders,
        maxContentLengthBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
        maxRedirects: MAX_FEED_REDIRECTS,
        onAxiosError: (error, isAxiosError) => {
          if (!isAxiosError(error)) {
            return;
          }

          const status = error.response?.status;
          const responseHeaders = error.response?.headers as
            | Record<string, unknown>
            | undefined;
          const xDataDome = responseHeaders?.["x-datadome"];
          const dataDomeHeader =
            typeof xDataDome === "string" ? xDataDome.toLowerCase() : "";

          if (status === 403 && dataDomeHeader === "protected") {
            throw new Error(
              "Upstream request received a vendor access response (DataDome) [HTTP 403]",
            );
          }
        },
        timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
        url,
      },
      {
        axiosGetFn: deps?.axiosGetFn,
        isAxiosErrorFn: deps?.isAxiosErrorFn,
      },
    );
  } catch (error) {
    if (preferredError) {
      throw preferredError;
    }

    throw error;
  }
}

function createFeedStageError(
  statusCode: number,
  headers?: Record<string, string | string[] | undefined>,
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
