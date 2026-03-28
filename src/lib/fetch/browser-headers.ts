import { CHROME_HEADERS_BASE } from "./constants";

interface BrowserHeaderOptions {
  accept?: string;
  referer?: string;
  secChUa?: string;
}

export function createBrowserHeaders(
  options?: BrowserHeaderOptions,
): Record<string, string> {
  const chromeHeaders = CHROME_HEADERS_BASE;
  const headers: [string, string][] = [
    ["Cache-Control", chromeHeaders["Cache-Control"]],
    ["Sec-Ch-Ua", options?.secChUa ?? chromeHeaders["Sec-Ch-Ua"]],
    ["Sec-Ch-Ua-Mobile", chromeHeaders["Sec-Ch-Ua-Mobile"]],
    ["Sec-Ch-Ua-Platform", chromeHeaders["Sec-Ch-Ua-Platform"]],
    [
      "Upgrade-Insecure-Requests",
      chromeHeaders["Upgrade-Insecure-Requests"],
    ],
    ["User-Agent", chromeHeaders["User-Agent"]],
    ["Accept", options?.accept ?? chromeHeaders.Accept],
    [
      "Sec-Fetch-Site",
      options?.referer ? "cross-site" : chromeHeaders["Sec-Fetch-Site"],
    ],
    ["Sec-Fetch-Mode", chromeHeaders["Sec-Fetch-Mode"]],
    ["Sec-Fetch-User", chromeHeaders["Sec-Fetch-User"]],
    ["Sec-Fetch-Dest", chromeHeaders["Sec-Fetch-Dest"]],
  ];

  if (options?.referer) {
    headers.push(["Referer", options.referer]);
  }

  headers.push(
    ["Accept-Encoding", chromeHeaders["Accept-Encoding"]],
    ["Accept-Language", chromeHeaders["Accept-Language"]],
    ["priority", chromeHeaders.priority],
  );

  return Object.fromEntries(headers);
}