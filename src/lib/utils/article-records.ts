/**
 * Shared article-like record fields used by feed parsing and dashboard
 * collection helpers when they normalize, deduplicate, and sort entries.
 */
export interface ArticleRecordLike {
  content: string;
  link: string;
  publicationDate: Date | string;
}

/**
 * Process the dedupe article records.
 * @param records - The records.
 * @param shouldReplace - Whether should replace.
 * @returns The dedupe article records.
 */
export function dedupeArticleRecords<T extends ArticleRecordLike>(
  records: T[],
  shouldReplace: (candidate: T, current: T) => boolean,
): T[] {
  const recordsByLink = new Map<string, T>();

  for (const record of records) {
    const normalizedLink = getNormalizedArticleRecordKey(record);
    if (!normalizedLink) {
      continue;
    }

    const current = recordsByLink.get(normalizedLink);

    if (!current) {
      recordsByLink.set(normalizedLink, record);
      continue;
    }

    if (shouldReplace(record, current)) {
      recordsByLink.set(normalizedLink, record);
    }
  }

  return [...recordsByLink.values()];
}

/**
 * Return the normalized article record key.
 * @param record - The record.
 * @returns The normalized article record key.
 */
export function getNormalizedArticleRecordKey(
  record: Pick<ArticleRecordLike, "link">,
): string {
  return record.link.trim();
}

/**
 * Process the prefer newer article record.
 * @param candidate - The candidate.
 * @param current - The current.
 * @returns Whether prefer newer article record.
 */
export function preferNewerArticleRecord<T extends ArticleRecordLike>(
  candidate: T,
  current: T,
): boolean {
  const candidateTimestamp = getArticleRecordTimestamp(candidate);
  const currentTimestamp = getArticleRecordTimestamp(current);

  return (
    candidateTimestamp > currentTimestamp ||
    (candidateTimestamp === currentTimestamp &&
      candidate.content.length > current.content.length)
  );
}

/**
 * Process the prefer richer article record.
 * @param candidate - The candidate.
 * @param current - The current.
 * @returns Whether prefer richer article record.
 */
export function preferRicherArticleRecord<T extends ArticleRecordLike>(
  candidate: T,
  current: T,
): boolean {
  if (candidate.content.length !== current.content.length) {
    return candidate.content.length > current.content.length;
  }

  return (
    getArticleRecordTimestamp(candidate) > getArticleRecordTimestamp(current)
  );
}

/**
 * Comparator that sorts article records by publication date, newest first.
 * @param a - First article record.
 * @param b - Second article record.
 * @returns Negative, zero, or positive number for use with Array.sort.
 */
export function sortArticleRecordsByPublicationDateDesc<
  T extends Pick<ArticleRecordLike, "publicationDate">,
>(a: T, b: T): number {
  return getArticleRecordTimestamp(b) - getArticleRecordTimestamp(a);
}

/**
 * Return the article record timestamp.
 * @param record - The record.
 * @returns The article record timestamp.
 */
function getArticleRecordTimestamp(
  record: Pick<ArticleRecordLike, "publicationDate">,
): number {
  return new Date(record.publicationDate).getTime();
}
