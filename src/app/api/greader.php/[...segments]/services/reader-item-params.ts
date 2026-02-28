import { parseReaderItemId } from "@/lib/core/stream-ids";

export function parseDistinctReaderArticleIds(
  values: string[],
  options?: { maxItems?: number },
): number[] {
  const maxItems = options?.maxItems ?? 250;
  const ids: number[] = [];
  const seen = new Set<number>();

  for (const value of values) {
    const parsed = parseReaderItemId(value);
    if (parsed === null || seen.has(parsed)) {
      continue;
    }

    ids.push(parsed);
    seen.add(parsed);

    if (ids.length >= maxItems) {
      break;
    }
  }

  return ids;
}
