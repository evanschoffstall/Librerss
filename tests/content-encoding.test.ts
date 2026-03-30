import { describe, expect, test } from "bun:test";
import * as zlib from "zlib";

import {
  decodePossiblyCompressedText,
  decodeTextBody,
  decompressBody,
} from "@/lib/utils/content-encoding";

describe("content encoding utilities", () => {
  test("passes through html-looking latin1 text without attempting decompression", async () => {
    const html = "  <!DOCTYPE html><html><body>Example</body></html>";

    await expect(decodePossiblyCompressedText(html)).resolves.toBe(html);
  });

  test("decodes compressed latin1 text when the payload is not already html", async () => {
    const compressed = zlib
      .gzipSync(Buffer.from("latin1 gzip payload", "utf8"))
      .toString("latin1");

    await expect(decodePossiblyCompressedText(compressed)).resolves.toBe(
      "latin1 gzip payload",
    );
  });

  test("returns utf8 text directly when no content encoding is present", async () => {
    const body = Buffer.from("plain utf8 text", "utf8");

    await expect(decodeTextBody(body, undefined)).resolves.toBe("plain utf8 text");
  });

  test("decodes gzip bodies while ignoring identity markers", async () => {
    const body = zlib.gzipSync(Buffer.from("gzip payload", "utf8"));

    await expect(decodeTextBody(body, "identity, gzip")).resolves.toBe(
      "gzip payload",
    );
  });

  test("detects gzip bodies when the upstream header is missing", async () => {
    const body = zlib.gzipSync(Buffer.from("headerless gzip payload", "utf8"));

    await expect(decodeTextBody(body, undefined)).resolves.toBe(
      "headerless gzip payload",
    );
  });

  test("detects deflate bodies when the upstream header is missing", async () => {
    const body = zlib.deflateSync(Buffer.from("headerless deflate payload", "utf8"));

    await expect(decodeTextBody(body, undefined)).resolves.toBe(
      "headerless deflate payload",
    );
  });

  test("decodes brotli-compressed bodies", async () => {
    const body = zlib.brotliCompressSync(Buffer.from("brotli payload", "utf8"));

    await expect(decodeTextBody(body, "br")).resolves.toBe("brotli payload");
  });

  test("falls back to inflateRaw when deflate payloads are raw streams", async () => {
    const body = zlib.deflateRawSync(Buffer.from("raw deflate payload", "utf8"));

    await expect(decodeTextBody(body, "deflate")).resolves.toBe(
      "raw deflate payload",
    );
  });

  test("accepts x-gzip as a gzip alias", async () => {
    const body = zlib.gzipSync(Buffer.from("x-gzip payload", "utf8"));

    await expect(decodeTextBody(body, "x-gzip")).resolves.toBe(
      "x-gzip payload",
    );
  });

  test("returns the original bytes for unknown encodings", async () => {
    const body = Buffer.from("leave me alone", "utf8");

    await expect(decompressBody(body, "compress")).resolves.toBe("leave me alone");
  });

  test("still enforces output limits for unknown encodings", async () => {
    const body = Buffer.from("leave me alone", "utf8");

    await expect(
      decodeTextBody(body, "compress", { maxOutputBytes: 4 }),
    ).rejects.toThrow("Upstream response too large");
  });

  test("falls back to the utf8 body when a bogus encoding header wraps html", async () => {
    const html = "<html><body>Broken header fallback</body></html>";
    const body = Buffer.from(html, "utf8");

    await expect(decodeTextBody(body, "gzip")).resolves.toBe(html);
  });

  test("surfaces decode errors for invalid non-html compressed payloads", async () => {
    const body = Buffer.from("not really compressed", "utf8");

    await expect(decodeTextBody(body, "gzip")).rejects.toThrow(
      "Failed to decode upstream gzip response",
    );
  });

  test("surfaces node max-output errors from direct decompression", async () => {
    const inflated = "x".repeat(1024);
    const body = zlib.gzipSync(Buffer.from(inflated, "utf8"));

    await expect(
      decompressBody(body, "gzip", { maxOutputBytes: 128 }),
    ).rejects.toThrow("Cannot create a Buffer larger than 128 bytes");
  });

  test("wraps oversized decode failures with the shared upstream-too-large error", async () => {
    const inflated = "x".repeat(1024);
    const body = zlib.gzipSync(Buffer.from(inflated, "utf8"));

    await expect(
      decodeTextBody(body, "gzip", { maxOutputBytes: 128 }),
    ).rejects.toThrow("Upstream response too large");
  });

  test("detects and decodes zstd bodies when native zstd support is available", async () => {
    const nativeZstdCompress = (zlib as Record<string, unknown>).zstdCompress as
      | typeof zlib.brotliCompress
      | undefined;

    if (!nativeZstdCompress) {
      return;
    }

    const body = await new Promise<Buffer>((resolve, reject) => {
      nativeZstdCompress(Buffer.from("native zstd payload", "utf8"), (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      });
    });

    await expect(decodeTextBody(body, undefined)).resolves.toBe(
      "native zstd payload",
    );
  });

  test("falls back to the streaming zstd decoder when native zstd decompression is unavailable", async () => {
    const nativeZstdCompress = (zlib as Record<string, unknown>).zstdCompress as
      | typeof zlib.brotliCompress
      | undefined;
    const originalZstdDecompress = (zlib as Record<string, unknown>).zstdDecompress;
    const zstdDecompressDescriptor = Object.getOwnPropertyDescriptor(
      zlib,
      "zstdDecompress",
    );

    if (!nativeZstdCompress || zstdDecompressDescriptor?.configurable === false) {
      return;
    }

    const body = await new Promise<Buffer>((resolve, reject) => {
      nativeZstdCompress(Buffer.from("streaming zstd payload", "utf8"), (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      });
    });

    try {
      Object.defineProperty(zlib, "zstdDecompress", {
        configurable: true,
        value: undefined,
      });

      await expect(decodeTextBody(body, undefined)).resolves.toBe(
        "streaming zstd payload",
      );
    } finally {
      Object.defineProperty(zlib, "zstdDecompress", {
        configurable: true,
        value: originalZstdDecompress,
      });
    }
  });

  test("enforces output limits while streaming zstd fallback chunks", async () => {
    const nativeZstdCompress = (zlib as Record<string, unknown>).zstdCompress as
      | typeof zlib.brotliCompress
      | undefined;
    const originalZstdDecompress = (zlib as Record<string, unknown>).zstdDecompress;
    const zstdDecompressDescriptor = Object.getOwnPropertyDescriptor(
      zlib,
      "zstdDecompress",
    );

    if (!nativeZstdCompress || zstdDecompressDescriptor?.configurable === false) {
      return;
    }

    const body = await new Promise<Buffer>((resolve, reject) => {
      nativeZstdCompress(Buffer.from("z".repeat(512), "utf8"), (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      });
    });

    try {
      Object.defineProperty(zlib, "zstdDecompress", {
        configurable: true,
        value: undefined,
      });

      await expect(
        decodeTextBody(body, "zstd", { maxOutputBytes: 32 }),
      ).rejects.toThrow("Upstream response too large");
    } finally {
      Object.defineProperty(zlib, "zstdDecompress", {
        configurable: true,
        value: originalZstdDecompress,
      });
    }
  });
});
