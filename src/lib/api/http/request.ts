import { NextResponse } from "next/server";

import { CONFIG } from "@/lib/config";

import { jsonError } from "./responses";

interface ParsedJsonFailure {
  ok: false;
  response: NextResponse;
}

type ParsedJsonResult<T> = ParsedJsonFailure | ParsedJsonSuccess<T>;

interface ParsedJsonSuccess<T> {
  data: T;
  ok: true;
}

export function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getSearchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

export async function parseFormOrQueryParams(
  request: Request,
  options?: { maxBytes?: number },
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
    try {
      const formData = await request.formData();
      const params = new URLSearchParams();

      let totalBytes = 0;
      for (const [key, value] of Array.from(formData.entries())) {
        if (typeof value === "string") {
          totalBytes +=
            Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8");
          if (totalBytes > maxBytes) {
            return bodyTooLarge;
          }
          params.append(key, value);
        }
      }

      return params;
    } catch {
      return jsonError("Invalid form body", 400);
    }
  }

  const raw = await request.text();
  if (isBodyTooLargeByUtf8Length(raw, maxBytes)) {
    return bodyTooLarge;
  }

  return new URLSearchParams(raw);
}

export async function parseJsonBody<T>(
  request: Request,
  options?: { maxBytes?: number },
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

export async function parseJsonBodyOrResponse<T>(
  request: Request,
  options?: { maxBytes?: number },
): Promise<Response | T> {
  const parsed = await parseJsonBody<T>(request, options);
  if (!parsed.ok) {
    return parsed.response;
  }

  return parsed.data;
}

export async function parseJsonObjectBodyOrResponse(
  request: Request,
  options?: { maxBytes?: number },
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

export function parseNonNegativeInt(value: unknown): null | number {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function parsePositiveInt(value: unknown): null | number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function isBodyTooLargeByHeader(request: Request, maxBytes: number): boolean {
  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader) {
    return false;
  }

  const contentLength = Number(contentLengthHeader);
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

function isBodyTooLargeByUtf8Length(raw: string, maxBytes: number): boolean {
  return Buffer.byteLength(raw, "utf8") > maxBytes;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
