import axios from "axios";

import { CONFIG } from "@/lib/config";
import { stripUrlFragment } from "@/lib/utils/url";

interface FetchTextWithValidatedRedirectsDeps {
  axiosGetFn?: typeof axios.get;
  isAxiosErrorFn?: typeof axios.isAxiosError;
}

interface FetchTextWithValidatedRedirectsOptions {
  assertAllowedUrl: (url: string) => Promise<void>;
  headers?: Record<string, string>;
  maxContentLengthBytes?: number;
  maxRedirects: number;
  onAxiosError?: (
    error: unknown,
    isAxiosError: typeof axios.isAxiosError,
  ) => void;
  timeoutMs?: number;
  url: string;
}

export async function fetchTextWithValidatedRedirects(
  options: FetchTextWithValidatedRedirectsOptions,
  deps?: FetchTextWithValidatedRedirectsDeps,
): Promise<string> {
  const get = deps?.axiosGetFn ?? axios.get;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;

  // Strip any fragment from the initial URL before the first hop. URL fragments
  // are client-side navigation hints that must not appear in HTTP request URIs
  // (RFC 3986 §3.5). Some CDN edge nodes (Cloudflare, Akamai, Fastly) treat a
  // request-uri containing a literal '#' as malformed and return 403/400.
  let currentUrl = stripUrlFragment(options.url);

  for (let redirects = 0; redirects <= options.maxRedirects; redirects += 1) {
    await options.assertAllowedUrl(currentUrl);

    try {
      const response = await get(currentUrl, {
        headers: options.headers,
        maxContentLength:
          options.maxContentLengthBytes ?? CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
        maxRedirects: 0,
        responseType: "text",
        timeout: options.timeoutMs ?? CONFIG.FEED_REQUEST_TIMEOUT_MS,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      if (response.status >= 300 && response.status < 400) {
        if (redirects === options.maxRedirects) {
          throw new Error("Too many redirects");
        }

        const locationHeader = response.headers?.location;
        const location = Array.isArray(locationHeader)
          ? locationHeader[0]
          : locationHeader;

        if (typeof location !== "string" || !location.trim()) {
          throw new Error("Redirect without Location header");
        }

        currentUrl = new URL(location, currentUrl).toString();
        // Strip any fragment from the redirect target — same reason as above.
        currentUrl = stripUrlFragment(currentUrl);
        continue;
      }

      return typeof response.data === "string"
        ? response.data
        : String(response.data ?? "");
    } catch (error) {
      options.onAxiosError?.(error, isAxiosError);
      throw error;
    }
  }

  throw new Error("Too many redirects");
}
