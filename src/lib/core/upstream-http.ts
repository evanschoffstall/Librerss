import { CONFIG } from "@/lib/config";
import axios from "axios";

type FetchTextWithValidatedRedirectsDeps = {
  axiosGetFn?: typeof axios.get;
  isAxiosErrorFn?: typeof axios.isAxiosError;
};

type FetchTextWithValidatedRedirectsOptions = {
  url: string;
  assertAllowedUrl: (url: string) => Promise<void>;
  maxRedirects: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxContentLengthBytes?: number;
  onAxiosError?: (
    error: unknown,
    isAxiosError: typeof axios.isAxiosError,
  ) => void;
};

export async function fetchTextWithValidatedRedirects(
  options: FetchTextWithValidatedRedirectsOptions,
  deps?: FetchTextWithValidatedRedirectsDeps,
): Promise<string> {
  const get = deps?.axiosGetFn ?? axios.get;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;

  let currentUrl = options.url;

  for (let redirects = 0; redirects <= options.maxRedirects; redirects += 1) {
    await options.assertAllowedUrl(currentUrl);

    try {
      const response = await get(currentUrl, {
        timeout: options.timeoutMs ?? CONFIG.FEED_REQUEST_TIMEOUT_MS,
        maxContentLength:
          options.maxContentLengthBytes ?? CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
        maxRedirects: 0,
        responseType: "text",
        headers: options.headers,
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
