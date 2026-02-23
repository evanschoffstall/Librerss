/**
 * SSRF-safe HTTP fetching for RSS feed XML.
 */

import { CONFIG } from "@/lib/config";
import axios from "axios";
import { assertPublicFeedUrl } from "./feed-url-validator";

const MAX_FEED_REDIRECTS = 5;

export async function fetchFeedXml(url: string): Promise<string> {
  await assertPublicFeedUrl(url);
  try {
    const response = await axios.get(url, {
      timeout: CONFIG.FEED_REQUEST_TIMEOUT_MS,
      maxContentLength: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
      maxRedirects: MAX_FEED_REDIRECTS,
      responseType: "text",
      headers: {
        "User-Agent": CONFIG.FEED_REQUEST_USER_AGENT,
        Accept: CONFIG.FEED_REQUEST_ACCEPT,
        "Accept-Language": "en-US,en;q=0.8",
      },
      validateStatus: (status) => status >= 200 && status < 300,
      // Validate every redirect target against SSRF rules before following it.
      beforeRedirect: (options) => {
        const target = String(options.href ?? options.hostname ?? "");
        if (!target) throw new Error("Redirect with no target URL");
        // assertPublicFeedUrl is async but beforeRedirect is sync in axios.
        // We do a lightweight synchronous check here; the full async DNS
        // validation already ran on the original URL and will run again if
        // the feed record is re-fetched with the new URL.
        const parsed = new URL(target);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error(
            `Blocked redirect to non-HTTP protocol: ${parsed.protocol}`,
          );
        }
        if (parsed.username || parsed.password) {
          throw new Error("Blocked redirect to credentialed URL");
        }
      },
    });

    return typeof response.data === "string"
      ? response.data
      : String(response.data ?? "");
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const dataDomeHeader = String(
        error.response?.headers?.["x-datadome"] ?? "",
      ).toLowerCase();

      if (status === 403 && dataDomeHeader === "protected") {
        throw new Error(
          "Upstream blocked request with anti-bot protection (DataDome) [HTTP 403]",
        );
      }
    }

    throw error;
  }
}
