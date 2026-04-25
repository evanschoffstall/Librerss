import { CONFIG } from "@/lib";

import { jsonError } from "./responses";

interface FormOrQueryParamsOptions {
  maxBytes?: number;
}

interface JsonBodyOptions {
  maxBytes?: number;
}

interface JsonBodyOrResponseOptions {
  maxBytes?: number;
}

interface JsonObjectBodyOrResponseOptions {
  maxBytes?: number;
}

interface ParsedJsonFailure {
  ok: false;
  response: Response;
}
type ParsedJsonResult<T> = ParsedJsonFailure | ParsedJsonSuccess<T>;

interface ParsedJsonSuccess<T> {
  data: T;
  ok: true;
}
/**
 * Return the as trimmed string.
 * @param value - The value.
 * @returns The as trimmed string.
 */
export function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Return the search params.
 * @param request - The request.
 * @returns The search params.
 */
export function getSearchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}
/**
 * Parse the form or query params.
 * @param request - The request.
 * @param options - The options used to parse the form or query params.
 * @returns The form or query params.
 */
export async function parseFormOrQueryParams(
  request: Request,
  options?: FormOrQueryParamsOptions,
): Promise<Response | URLSearchParams> {
  const maxBytes = options?.maxBytes ?? CONFIG.MAX_JSON_BODY_BYTES;

  if (request.method === "GET") {
    return getSearchParams(request);
  }

  const bodyTooLarge = jsonError("Request body too large", 413);
  const contentType = request.headers.get("content-type") ?? "";

  if (isBodyTooLargeByHeader(request, maxBytes)) {
    return bodyTooLarge;
  }

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    return parseMultipartFormBody(request, maxBytes, bodyTooLarge);
  }

  const raw = await request.text();
  if (isBodyTooLargeByUtf8Length(raw, maxBytes)) {
    return bodyTooLarge;
  }

  return new URLSearchParams(raw);
}

/**
 * Parse the json body.
 * @param request - The request.
 * @param options - The options used to parse the json body.
 * @returns The json body.
 */
export async function parseJsonBody<T>(
  request: Request,
  options?: JsonBodyOptions,
): Promise<ParsedJsonResult<T>> {
  const maxBytes = options?.maxBytes ?? CONFIG.MAX_JSON_BODY_BYTES;
  const bodyTooLarge: ParsedJsonFailure = {
    ok: false,
    response: jsonError("Request body too large", 413),
  };

  if (isBodyTooLargeByHeader(request, maxBytes)) {
    return bodyTooLarge;
  }

  try {
    const raw = await request.text();
    if (isBodyTooLargeByUtf8Length(raw, maxBytes)) {
      return bodyTooLarge;
    }

    return {
      data: JSON.parse(raw) as T,
      ok: true,
    };
  } catch {
    return {
      ok: false,
      response: jsonError("Invalid JSON body", 400),
    };
  }
}
/**
 * Parse the json body or response.
 * @param request - The request.
 * @param options - The options used to parse the json body or response.
 * @returns The json body or response.
 */
export async function parseJsonBodyOrResponse<T>(
  request: Request,
  options?: JsonBodyOrResponseOptions,
): Promise<Response | T> {
  const parsed = await parseJsonBody<T>(request, options);
  if (!parsed.ok) {
    return parsed.response;
  }

  return parsed.data;
}

/**
 * Parse the json object body or response.
 * @param request - The request.
 * @param options - The options used to parse the json object body or response.
 * @returns The json object body or response.
 */
export async function parseJsonObjectBodyOrResponse(
  request: Request,
  options?: JsonObjectBodyOrResponseOptions,
): Promise<Record<string, unknown> | Response> {
  const parsed = await parseJsonBody<unknown>(request, options);
  if (!parsed.ok) {
    return parsed.response;
  }

  if (!isJsonObject(parsed.data)) {
    return jsonError("JSON body must be an object", 400);
  }

  return parsed.data;
}

/**
 * Parse the non negative int.
 * @param value - The value.
 * @returns The non negative int.
 */
export function parseNonNegativeInt(value: unknown): null | number {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Parse the positive int.
 * @param value - The value.
 * @returns The positive int.
 */
export function parsePositiveInt(value: unknown): null | number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

/**
 * Return whether is body too large by header.
 * @param request - The request.
 * @param maxBytes - The max bytes.
 * @returns Whether is body too large by header.
 */
function isBodyTooLargeByHeader(request: Request, maxBytes: number): boolean {
  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader) {
    return false;
  }

  const contentLength = Number(contentLengthHeader);
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

/**
 * Return whether is body too large by utf8 length.
 * @param raw - The raw.
 * @param maxBytes - The max bytes.
 * @returns Whether is body too large by utf8 length.
 */
function isBodyTooLargeByUtf8Length(raw: string, maxBytes: number): boolean {
  return Buffer.byteLength(raw, "utf8") > maxBytes;
}

/**
 * Return whether is json object.
 * @param value - The value.
 * @returns Whether is json object.
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the multipart form body.
 * @param request - The request.
 * @param maxBytes - The max bytes.
 * @param bodyTooLarge - The body too large.
 * @returns The multipart form body.
 */
async function parseMultipartFormBody(
  request: Request,
  maxBytes: number,
  bodyTooLarge: Response,
): Promise<Response | URLSearchParams> {
  try {
    const formData = await request.formData();
    const params = new URLSearchParams();

    let totalBytes = 0;
    for (const [key, value] of Array.from(formData.entries())) {
      if (typeof value !== "string") {
        continue;
      }

      totalBytes +=
        Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8");
      if (totalBytes > maxBytes) {
        return bodyTooLarge;
      }

      params.append(key, value);
    }

    return params;
  } catch {
    return jsonError("Invalid form body", 400);
  }
}
