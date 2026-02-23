import { parseReaderItemId } from "@/lib/core/reader-item-id";

export function parseDistinctReaderArticleIds(values: string[]): number[] {
  return Array.from(
    new Set(
      values
        .map((value) => parseReaderItemId(value))
        .filter((value): value is number => value !== null),
    ),
  );
}
