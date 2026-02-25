/**
 * SSRF-safe HTTP fetching for RSS feed XML.
 */

import { CONFIG } from "@/lib/config";
import axios from "axios";
import { assertPublicFeedUrl } from "./feed-url-validator";
import { fetchTextWithValidatedRedirects } from "./upstream-http";

const MAX_FEED_REDIRECTS = 5;

type FeedHttpDeps = {
  assertPublicFeedUrlFn?: (url: string) => Promise<void>;
  axiosGetFn?: typeof axios.get;
  isAxiosErrorFn?: typeof axios.isAxiosError;
};

export async function fetchFeedXml(
  url: string,
  deps?: FeedHttpDeps,
): Promise<string> {
  const assertUrl = deps?.assertPublicFeedUrlFn ?? assertPublicFeedUrl;
  return fetchTextWithValidatedRedirects(
    {
      url,
      assertAllowedUrl: assertUrl,
      maxRedirects: MAX_FEED_REDIRECTS,
      timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
      maxContentLengthBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
      headers: {
        "User-Agent": CONFIG.FEED_REQUEST_USER_AGENT,
        Accept: CONFIG.FEED_REQUEST_ACCEPT,
        "Accept-Language": "en-US,en;q=0.8",
      },
      onAxiosError: (error, isAxiosError) => {
        if (!isAxiosError(error)) {
          return;
        }

        const status = error.response?.status;
        const dataDomeHeader = String(
          error.response?.headers?.["x-datadome"] ?? "",
        ).toLowerCase();

        if (status === 403 && dataDomeHeader === "protected") {
          throw new Error(
            "Upstream blocked request with anti-bot protection (DataDome) [HTTP 403]",
          );
        }
      },
    },
    {
      axiosGetFn: deps?.axiosGetFn,
      isAxiosErrorFn: deps?.isAxiosErrorFn,
    },
  );
}
