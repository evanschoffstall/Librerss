import { CONFIG } from "@/lib/config";
import { parseDateOrNull } from "@/lib/utils/date-utils";
import { NextResponse } from "next/server";
import { jsonError } from "./responses";

type ParsedJsonSuccess<T> = {
  ok: true;
  data: T;
};

type ParsedJsonFailure = {
  ok: false;
  response: NextResponse;
};

type ParsedJsonResult<T> = ParsedJsonSuccess<T> | ParsedJsonFailure;

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
      ok: true,
      data: JSON.parse(raw) as T,
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
): Promise<T | Response> {
  const parsed = await parseJsonBody<T>(request, options);
  if (!parsed.ok) {
    return parsed.response;
  }

  return parsed.data;
}

export async function parseFormOrQueryParams(
  request: Request,
  options?: { maxBytes?: number },
): Promise<URLSearchParams | Response> {
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

      for (const [key, value] of Array.from(formData.entries())) {
        if (typeof value === "string") {
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

export function getSearchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

export function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parsePositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
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

export function parseNonNegativeInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function parseUnixTimestampSeconds(value: unknown): Date | null {
  const seconds = parsePositiveInt(value);
  if (!seconds) {
    return null;
  }

  const parsed = new Date(seconds * 1000);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDateInput(value: unknown): Date | null {
  return parseDateOrNull(value);
}
