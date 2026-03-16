/**
 * SSRF-safe HTTP fetching for RSS feed XML.
 */

import axios from "axios";

import { CONFIG } from "@/lib/config";

import { assertPublicFeedUrl } from "./feed-url-validator";
import { fetchTextWithValidatedRedirects } from "./upstream-http";

const MAX_FEED_REDIRECTS = 5;

interface FeedHttpDeps {
  assertPublicFeedUrlFn?: (url: string) => Promise<void>;
  axiosGetFn?: typeof axios.get;
  isAxiosErrorFn?: typeof axios.isAxiosError;
}

export async function fetchFeedXml(
  url: string,
  deps?: FeedHttpDeps,
): Promise<string> {
  const assertUrl = deps?.assertPublicFeedUrlFn ?? assertPublicFeedUrl;
  return fetchTextWithValidatedRedirects(
    {
      assertAllowedUrl: assertUrl,
      headers: {
        Accept: CONFIG.FEED_REQUEST_ACCEPT,
        "Accept-Language": "en-US,en;q=0.8",
        "User-Agent": CONFIG.FEED_REQUEST_USER_AGENT,
      },
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
            "Upstream blocked request with anti-bot protection (DataDome) [HTTP 403]",
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
}
