import { NextResponse } from "next/server";

type ParsedJsonSuccess<T> = {
  ok: true;
  data: T;
};

type ParsedJsonFailure = {
  ok: false;
  response: NextResponse;
};

export type ParsedJsonResult<T> = ParsedJsonSuccess<T> | ParsedJsonFailure;

export async function parseJsonBody<T>(
  request: Request,
): Promise<ParsedJsonResult<T>> {
  try {
    return {
      ok: true,
      data: (await request.json()) as T,
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
