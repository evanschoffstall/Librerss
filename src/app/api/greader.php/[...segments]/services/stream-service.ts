import {
  parseNonNegativeInt,
  parsePositiveInt,
  parseUnixTimestampSeconds,
} from "@/lib/api/http";
import { READ_STATE, READING_LIST_STREAM } from "@/lib/core/stream-ids";
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
    const continuationOffset = parseNonNegativeInt(
      continuation.slice("offset:".length),
    );

    if (continuationOffset !== null) {
      return {
        limit,
        offset: continuationOffset,
        continuationId: null,
        isNetNewsWire,
      };
    }
  }

  const parsedContinuationId = parsePositiveInt(continuation);

  if (parsedContinuationId !== null) {
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
  return parseUnixTimestampSeconds(searchParams.get("ot"));
}

export function shouldExcludeReadFromStream(
  streamId: string,
  excludedTags: string[],
): boolean {
  const excludeReadRequested = excludedTags.includes(READ_STATE);

  if (!excludeReadRequested) {
    return false;
  }

  return streamId === READING_LIST_STREAM;
}
