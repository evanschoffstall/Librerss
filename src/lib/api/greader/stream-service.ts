import {
  DEFAULT_STREAM_ITEMS,
  MAX_STREAM_ITEMS,
  NETNEWSWIRE_MAX_STREAM_ITEMS,
} from "./constants";

import {
  parseNonNegativeInt,
  parsePositiveInt,
  parseUnixTimestampSeconds,
} from "@/lib/api/http";
import { READ_STATE } from "@/lib/core/stream-ids";

export function parseOlderThanDate(searchParams: URLSearchParams): Date | null {
  return parseUnixTimestampSeconds(searchParams.get("ot"));
}

export function parseStreamId(resource: string): string {
  const raw = resource.slice("stream/contents/".length);
  return decodeURIComponent(raw);
}

export function parseStreamPaging(
  searchParams: URLSearchParams,
  userAgent: string,
): {
  continuationId: null | number;
  isNetNewsWire: boolean;
  limit: number;
  offset: number;
} {
  const isNetNewsWire = /netnewswire/i.test(userAgent);
  const requested = parsePositiveInt(searchParams.get("n"));
  const maxStreamItems = isNetNewsWire
    ? NETNEWSWIRE_MAX_STREAM_ITEMS
    : MAX_STREAM_ITEMS;
  const limit = Math.min(requested ?? DEFAULT_STREAM_ITEMS, maxStreamItems);

  const continuation = searchParams.get("c");
  if (!continuation) {
    return { continuationId: null, isNetNewsWire, limit, offset: 0 };
  }

  if (continuation.startsWith("offset:")) {
    const continuationOffset = parseNonNegativeInt(
      continuation.slice("offset:".length),
    );

    if (continuationOffset !== null) {
      return {
        continuationId: null,
        isNetNewsWire,
        limit,
        offset: continuationOffset,
      };
    }
  }

  const parsedContinuationId = parsePositiveInt(continuation);

  if (parsedContinuationId !== null) {
    return {
      continuationId: parsedContinuationId,
      isNetNewsWire,
      limit,
      offset: 0,
    };
  }

  return { continuationId: null, isNetNewsWire, limit, offset: 0 };
}

export function shouldExcludeReadFromStream(excludedTags: string[]): boolean {
  return excludedTags.includes(READ_STATE);
}
