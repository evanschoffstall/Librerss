import { parsePositiveInt } from "@/lib/api/request";
import {
  DEFAULT_STREAM_ITEMS,
  MAX_STREAM_ITEMS,
  NETNEWSWIRE_MAX_STREAM_ITEMS,
} from "../constants";

export function parseStreamPaging(
  searchParams: URLSearchParams,
  userAgent: string,
): {
  limit: number;
  offset: number;
  continuationId: number | null;
  isNetNewsWire: boolean;
} {
  const isNetNewsWire = /netnewswire/i.test(userAgent);
  const requested = parsePositiveInt(searchParams.get("n"));
  const maxStreamItems = isNetNewsWire
    ? NETNEWSWIRE_MAX_STREAM_ITEMS
    : MAX_STREAM_ITEMS;
  const limit = Math.min(requested ?? DEFAULT_STREAM_ITEMS, maxStreamItems);

  const continuation = searchParams.get("c");
  if (!continuation) {
    return { limit, offset: 0, continuationId: null, isNetNewsWire };
  }

  if (continuation.startsWith("offset:")) {
    const continuationOffset = Number.parseInt(
      continuation.slice("offset:".length),
      10,
    );

    if (Number.isInteger(continuationOffset) && continuationOffset >= 0) {
      return {
        limit,
        offset: continuationOffset,
        continuationId: null,
        isNetNewsWire,
      };
    }
  }

  const parsedContinuationId = Number.parseInt(continuation, 10);

  if (Number.isInteger(parsedContinuationId) && parsedContinuationId > 0) {
    return {
      limit,
      offset: 0,
      continuationId: parsedContinuationId,
      isNetNewsWire,
    };
  }

  return { limit, offset: 0, continuationId: null, isNetNewsWire };
}

export function parseStreamId(resource: string): string {
  const raw = resource.slice("stream/contents/".length);
  return decodeURIComponent(raw);
}

export function parseOlderThanDate(searchParams: URLSearchParams): Date | null {
  const olderThanSec = Number.parseInt(searchParams.get("ot") ?? "", 10);

  if (!Number.isInteger(olderThanSec) || olderThanSec <= 0) {
    return null;
  }

  const parsed = new Date(olderThanSec * 1000);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}
