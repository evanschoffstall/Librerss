import { decompressBody } from "@/lib/utils/content-encoding";

/**
 * Captures a non-success upstream response returned through the HTTPCloak
 * transport together with the metadata needed for diagnostics.
 */
export class HttpCloakUpstreamError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: string,
    readonly proxyMode: string,
    readonly proxyAddress: null | string,
    readonly allowInsecureTls: boolean,
    readonly redirectHop: number,
    readonly responseHeaders: Record<string, string | string[] | undefined>,
    readonly requestHeaders: Record<string, string | string[] | undefined>,
  ) {
    super(`Upstream responded with status ${statusCode}`);
  }
}

export { decompressBody };

/**
 * Retains only the upstream headers that are useful for compatibility and
 * anti-bot diagnostics.
 */
export function pickDiagnosticHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const KEEP = new Set([
    "cf-ray",
    "content-type",
    "retry-after",
    "server",
    "via",
    "x-cache",
    "x-datadome",
  ]);
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (KEEP.has(lower) || lower.startsWith("x-px-")) out[lower] = v;
  }
  const sc = headers["set-cookie"];
  const scCount = Array.isArray(sc) ? sc.length : sc ? 1 : 0;
  if (scCount > 0) out["set-cookie-count"] = scCount;
  return out;
}
