import { decodeTextBody } from "./content-encoding";

/**
 * Minimal response shape for HTTPCloak-backed body decoding helpers.
 */
export interface EncodedHttpResponse {
  body: Buffer | string;
  headers: Record<string, string | string[] | undefined>;
  text?: string;
}

/**
 * Decode an upstream response body, honoring pre-decoded text and
 * content-encoding headers from HTTPCloak responses.
 * @param response
 * @param options
 * @param options.maxOutputBytes
 */
export async function decodeHttpResponseBody(
  response: EncodedHttpResponse,
  options: {
    maxOutputBytes: number;
  },
): Promise<string> {
  if (typeof response.text === "string") {
    return response.text;
  }

  return decodeTextBody(
    Buffer.isBuffer(response.body)
      ? response.body
      : Buffer.from(response.body, "latin1"),
    getSingleHeaderValue(response.headers, "content-encoding"),
    { maxOutputBytes: options.maxOutputBytes },
  );
}

/**
 * Read a single header value with exact-then-case-insensitive lookup semantics.
 * @param headers
 * @param headerName
 */
export function getSingleHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  headerName: string,
): string | undefined {
  const exactValue = normalizeHeaderValue(headers[headerName]);
  if (exactValue !== undefined) {
    return exactValue;
  }

  const normalizedHeaderName = headerName.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === normalizedHeaderName) {
      return normalizeHeaderValue(value);
    }
  }

  return undefined;
}

/**
 * @param value
 */
function normalizeHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
