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
 * Describes the options for HTTP response body.
 */
interface HttpResponseBodyOptions {
  maxOutputBytes: number;
}

/**
 * Decode the http response body.
 * @param response - The response.
 * @param options - The options used to decode the http response body.
 * @returns The http response body.
 */
export async function decodeHttpResponseBody(
  response: EncodedHttpResponse,
  options: HttpResponseBodyOptions,
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
 * Return the single header value.
 * @param headers - The headers.
 * @param headerName - The header name.
 * @returns The single header value.
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
 * Normalize the header value.
 * @param value - The value.
 * @returns The header value.
 */
function normalizeHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
