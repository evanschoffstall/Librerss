import { CHROME_HEADERS_BASE } from "./constants";
import type { CookieJar } from "tough-cookie";

export function generateBrowserHeaders(
  _alpnHint: "1" | "2",
  opts?: { accept?: string; referer?: string; secChUa?: string },
): Record<string, string> {
  const c = CHROME_HEADERS_BASE;
  const headers: Record<string, string> = {
    "Cache-Control": c["Cache-Control"],
    "Sec-Ch-Ua": opts?.secChUa ?? c["Sec-Ch-Ua"],
    "Sec-Ch-Ua-Mobile": c["Sec-Ch-Ua-Mobile"],
    "Sec-Ch-Ua-Platform": c["Sec-Ch-Ua-Platform"],
    "Upgrade-Insecure-Requests": c["Upgrade-Insecure-Requests"],
    "User-Agent": c["User-Agent"],
    Accept: opts?.accept ?? c.Accept,
    "Sec-Fetch-Site": opts?.referer ? "cross-site" : c["Sec-Fetch-Site"],
    "Sec-Fetch-Mode": c["Sec-Fetch-Mode"],
    "Sec-Fetch-User": c["Sec-Fetch-User"],
    "Sec-Fetch-Dest": c["Sec-Fetch-Dest"],
    ...(opts?.referer ? { Referer: opts.referer } : {}),
    "Accept-Encoding": c["Accept-Encoding"],
    "Accept-Language": c["Accept-Language"],
    priority: c.priority,
  };
  return headers;
}

export function addCookiesToHeaders(
  headers: Record<string, string>,
  cookieJar: CookieJar | undefined,
  url: string,
): void {
  if (!cookieJar) return;
  try {
    const cs = cookieJar.getCookieStringSync(url);
    if (cs) headers["Cookie"] = cs;
  } catch {
    // skip
  }
}

export function storeCookiesFromResponse(
  cookieJar: CookieJar | undefined,
  responseHeaders: Record<string, string | string[] | undefined>,
  url: string,
): void {
  if (!cookieJar) return;
  const sc = responseHeaders["set-cookie"];
  const cookies = Array.isArray(sc) ? sc : typeof sc === "string" ? [sc] : [];
  for (const raw of cookies) {
    try {
      cookieJar.setCookieSync(raw, url);
    } catch {
      // malformed — skip
    }
  }
}
