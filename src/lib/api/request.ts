import { CONFIG } from "@/lib/config";
import { NextResponse } from "next/server";

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

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Request body too large" },
          { status: 413 },
        ),
      };
    }
  }

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Request body too large" },
          { status: 413 },
        ),
      };
    }

    return {
      ok: true,
      data: JSON.parse(raw) as T,
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }
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

export function parseDateInput(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
