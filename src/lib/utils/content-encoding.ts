import * as zlib from "zlib";

const TOO_LARGE_ERROR_MESSAGE = "Upstream response too large";

interface DecodeTextBodyOptions {
  maxOutputBytes?: number;
}

/**
 * Decodes HTML-like text that may still contain compressed bytes serialized as
 * latin1 text, such as upstream transport responses.
 * @param rawText
 * @param options
 */
export async function decodePossiblyCompressedText(
  rawText: string,
  options?: DecodeTextBodyOptions,
): Promise<string> {
  if (looksLikeHtmlDocument(rawText)) {
    return rawText;
  }

  return decodeTextBody(Buffer.from(rawText, "latin1"), undefined, options);
}

/**
 * Decodes a potentially-compressed upstream body into UTF-8 text while
 * enforcing an optional decompressed size ceiling.
 * @param body
 * @param contentEncoding
 * @param options
 */
export async function decodeTextBody(
  body: Buffer,
  contentEncoding: string | undefined,
  options?: DecodeTextBodyOptions,
): Promise<string> {
  const normalizedEncodings = normalizeContentEncodings(contentEncoding, body);
  const utf8Body = body.toString("utf8");
  const maxOutputBytes = options?.maxOutputBytes;

  if (normalizedEncodings.length === 0) {
    return utf8Body;
  }

  try {
    let decodedBody = body;

    for (const encoding of normalizedEncodings.toReversed()) {
      decodedBody = await decompressBodyToBuffer(
        decodedBody,
        encoding,
        maxOutputBytes,
      );
    }

    const decodedText = decodedBody.toString("utf8");
    assertWithinOutputLimit(decodedText, maxOutputBytes);
    return decodedText;
  } catch (error) {
    if (isTooLargeError(error)) {
      throw new Error(TOO_LARGE_ERROR_MESSAGE, { cause: error });
    }

    if (looksLikeHtmlDocument(utf8Body)) {
      return utf8Body;
    }

    throw new Error(
      `Failed to decode upstream ${normalizedEncodings.join(", ")} response: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Decompresses a single encoded buffer into UTF-8 text.
 * @param buf
 * @param encoding
 * @param options
 */
export async function decompressBody(
  buf: Buffer,
  encoding: string,
  options?: DecodeTextBodyOptions,
): Promise<string> {
  return (
    await decompressBodyToBuffer(buf, encoding, options?.maxOutputBytes)
  ).toString("utf8");
}

/**
 * @param output
 * @param maxOutputBytes
 */
function assertWithinOutputLimit(
  output: Buffer | string,
  maxOutputBytes: number | undefined,
): void {
  if (maxOutputBytes === undefined) {
    return;
  }

  const outputBytes = getOutputByteLength(output);

  if (outputBytes > maxOutputBytes) {
    throw new Error(TOO_LARGE_ERROR_MESSAGE);
  }
}

/**
 * @param maxOutputBytes
 */
function buildNodeZlibOptions(
  maxOutputBytes: number | undefined,
): zlib.ZlibOptions {
  return maxOutputBytes === undefined
    ? {}
    : { maxOutputLength: maxOutputBytes };
}

/**
 * @param maxOutputBytes
 */
function buildNodeZstdOptions(
  maxOutputBytes: number | undefined,
): zlib.ZstdOptions {
  return buildNodeZlibOptions(maxOutputBytes) as zlib.ZstdOptions;
}

/**
 * @param buf
 * @param encoding
 * @param maxOutputBytes
 */
async function decompressBodyToBuffer(
  buf: Buffer,
  encoding: string,
  maxOutputBytes?: number,
): Promise<Buffer> {
  if (encoding === "br") {
    return decompressWithNodeLimit((callback) => {
      zlib.brotliDecompress(
        buf,
        buildNodeZlibOptions(maxOutputBytes),
        callback,
      );
    });
  }

  if (encoding === "gzip" || encoding === "x-gzip") {
    return decompressWithNodeLimit((callback) => {
      zlib.gunzip(buf, buildNodeZlibOptions(maxOutputBytes), callback);
    });
  }

  if (encoding === "deflate") {
    try {
      return await decompressWithNodeLimit((callback) => {
        zlib.inflate(buf, buildNodeZlibOptions(maxOutputBytes), callback);
      });
    } catch (error) {
      if (!isDataError(error)) {
        throw error;
      }

      return decompressWithNodeLimit((callback) => {
        zlib.inflateRaw(buf, buildNodeZlibOptions(maxOutputBytes), callback);
      });
    }
  }

  if (encoding === "zstd") {
    return decompressZstd(buf, maxOutputBytes);
  }

  assertWithinOutputLimit(buf, maxOutputBytes);
  return Promise.resolve(buf);
}

/**
 * @param decompress
 */
function decompressWithNodeLimit(
  decompress: (callback: zlib.CompressCallback) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    decompress((error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

/**
 * @param buf
 * @param maxOutputBytes
 */
function decompressZstd(buf: Buffer, maxOutputBytes?: number): Promise<Buffer> {
  const nativeDecompress = (zlib as Record<string, unknown>).zstdDecompress as
    | typeof zlib.brotliDecompress
    | undefined;

  if (!nativeDecompress) {
    throw new Error("Native zstd decompression is unavailable in this runtime");
  }

  return decompressWithNodeLimit((callback) => {
    nativeDecompress(buf, buildNodeZstdOptions(maxOutputBytes), callback);
  });
}

/**
 * @param body
 */
function detectContentEncodingFromBody(body: Buffer): string | undefined {
  const firstFourBytes =
    body.length >= 4 ? body.subarray(0, 4).toString("hex") : null;

  if (firstFourBytes === "28b52ffd") {
    return "zstd";
  }

  const firstTwoBytes =
    body.length >= 2 ? body.subarray(0, 2).toString("hex") : null;

  if (firstTwoBytes === null) {
    return undefined;
  }

  return CONTENT_ENCODING_SIGNATURES[firstTwoBytes];
}

/**
 * @param output
 */
function getOutputByteLength(output: Buffer | string): number {
  return typeof output === "string"
    ? Buffer.byteLength(output, "utf8")
    : output.byteLength;
}

const CONTENT_ENCODING_SIGNATURES: Record<string, string> = {
  "1f8b": "gzip",
  "78da": "deflate",
  "789c": "deflate",
  "7801": "deflate",
};

/**
 * @param error
 */
function isDataError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && error.code === "Z_DATA_ERROR"
  );
}

/**
 * @param error
 */
function isTooLargeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message === TOO_LARGE_ERROR_MESSAGE ||
    error.message.includes("Cannot create a Buffer larger than") ||
    error.message.includes("maxOutputLength")
  );
}

/**
 * @param body
 */
function looksLikeHtmlDocument(body: string): boolean {
  const normalizedBody = body.trimStart().slice(0, 512).toLowerCase();
  return (
    normalizedBody.startsWith("<!doctype html") ||
    normalizedBody.startsWith("<html") ||
    normalizedBody.includes("<body")
  );
}

/**
 * @param contentEncoding
 * @param body
 */
function normalizeContentEncodings(
  contentEncoding: string | undefined,
  body: Buffer,
): string[] {
  if (contentEncoding) {
    return contentEncoding
      .split(",")
      .map((encoding) => encoding.trim().toLowerCase())
      .filter((encoding) => encoding.length > 0 && encoding !== "identity");
  }

  const detectedEncoding = detectContentEncodingFromBody(body);
  return detectedEncoding ? [detectedEncoding] : [];
}
