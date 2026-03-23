import { decompress as fzstdDecompress } from "fzstd";
import * as zlib from "zlib";

export async function decodePossiblyCompressedText(
  rawText: string,
): Promise<string> {
  if (looksLikeHtmlDocument(rawText)) {
    return rawText;
  }

  return decodeTextBody(Buffer.from(rawText, "latin1"), undefined);
}

export async function decodeTextBody(
  body: Buffer,
  contentEncoding: string | undefined,
): Promise<string> {
  const normalizedEncoding = normalizeContentEncoding(contentEncoding, body);
  const utf8Body = body.toString("utf8");

  if (!normalizedEncoding || normalizedEncoding.includes(",")) {
    return utf8Body;
  }

  try {
    return await decompressBody(body, normalizedEncoding);
  } catch (error) {
    if (looksLikeHtmlDocument(utf8Body)) {
      return utf8Body;
    }

    throw new Error(
      `Failed to decode upstream ${normalizedEncoding} response: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function decompressBody(buf: Buffer, encoding: string): Promise<string> {
  if (encoding === "br") {
    return new Promise((resolve, reject) => {
      zlib.brotliDecompress(buf, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(result.toString("utf-8"));
      });
    });
  }

  if (encoding === "gzip" || encoding === "x-gzip") {
    return new Promise((resolve, reject) => {
      zlib.gunzip(buf, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(result.toString("utf-8"));
      });
    });
  }

  if (encoding === "deflate") {
    return new Promise((resolve, reject) => {
      zlib.inflate(buf, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(result.toString("utf-8"));
      });
    });
  }

  if (encoding === "zstd") {
    return decompressZstd(buf);
  }

  return Promise.resolve(buf.toString("utf-8"));
}

/**
 * Decompress a zstd-encoded buffer. Prefers the native `zlib.zstdDecompress`
 * (available in Node.js ≥ 21.7 and Bun), falling back to the pure-JS `fzstd`
 * library for older Node.js versions (e.g. Node 20).
 */
function decompressZstd(buf: Buffer): Promise<string> {
  const nativeDecompress = (zlib as Record<string, unknown>)
    .zstdDecompress as typeof zlib.brotliDecompress | undefined;

  if (nativeDecompress) {
    return new Promise((resolve, reject) => {
      nativeDecompress(buf, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result.toString("utf-8"));
      });
    });
  }

  const decompressed = fzstdDecompress(new Uint8Array(buf));
  return Promise.resolve(Buffer.from(decompressed).toString("utf-8"));
}

function detectContentEncodingFromBody(body: Buffer): string | undefined {
  if (body.length >= 4) {
    const firstFourBytes = body.subarray(0, 4).toString("hex");

    if (firstFourBytes === "28b52ffd") {
      return "zstd";
    }
  }

  if (body.length >= 2) {
    const firstTwoBytes = body.subarray(0, 2).toString("hex");

    if (firstTwoBytes === "1f8b") {
      return "gzip";
    }

    if (["78da", "789c", "7801"].includes(firstTwoBytes)) {
      return "deflate";
    }
  }

  return undefined;
}

function looksLikeHtmlDocument(body: string): boolean {
  const normalizedBody = body.trimStart().slice(0, 512).toLowerCase();
  return (
    normalizedBody.startsWith("<!doctype html") ||
    normalizedBody.startsWith("<html") ||
    normalizedBody.includes("<body")
  );
}

function normalizeContentEncoding(
  contentEncoding: string | undefined,
  body: Buffer,
): string | undefined {
  const explicitEncoding = contentEncoding?.toLowerCase();
  if (explicitEncoding) {
    return explicitEncoding;
  }

  return detectContentEncodingFromBody(body);
}