import * as zlib from "zlib";

export class GotScrapingError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: string,
    readonly proxyMode: string,
    readonly proxyAddress: null | string,
    readonly browserVersion: number,
    readonly allowInsecureTls: boolean,
    readonly redirectHop: number,
    readonly responseHeaders: Record<string, string | string[] | undefined>,
    readonly requestHeaders: Record<string, string | string[] | undefined>,
  ) {
    super(`Upstream responded with status ${statusCode}`);
  }
}

export function decompressBody(buf: Buffer, encoding: string): Promise<string> {
  if (encoding === "br")
    return new Promise((resolve, reject) => {
      zlib.brotliDecompress(buf, (err, r) => {
        err ? reject(err) : resolve(r.toString("utf-8"));
      });
    });
  if (encoding === "gzip" || encoding === "x-gzip")
    return new Promise((resolve, reject) => {
      zlib.gunzip(buf, (err, r) => {
        err ? reject(err) : resolve(r.toString("utf-8"));
      });
    });
  if (encoding === "deflate")
    return new Promise((resolve, reject) => {
      zlib.inflate(buf, (err, r) => {
        err ? reject(err) : resolve(r.toString("utf-8"));
      });
    });
  if (encoding === "zstd") {
    const decompressZstd = (zlib as Record<string, unknown>).zstdDecompress as
      | typeof zlib.brotliDecompress
      | undefined;
    if (decompressZstd)
      return new Promise((resolve, reject) => {
        decompressZstd(buf, (err, r) => {
          err ? reject(err) : resolve(r.toString("utf-8"));
        });
      });
  }
  return Promise.resolve(buf.toString("utf-8"));
}

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
