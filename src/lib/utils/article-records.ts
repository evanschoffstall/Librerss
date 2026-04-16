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
 * Deduplicate article-like records by their normalized link with a caller-owned
 * replacement policy.
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
 * Normalize article-like links so every caller deduplicates the same key space.
 */
export function getNormalizedArticleRecordKey(
  record: Pick<ArticleRecordLike, "link">,
): string {
  return record.link.trim();
}

/**
 * Prefer newer records first, then prefer richer content for identical dates.
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
 * Prefer richer records first, then prefer newer timestamps as the tiebreaker.
 */
export function preferRicherArticleRecord<T extends ArticleRecordLike>(
  candidate: T,
  current: T,
): boolean {
  if (candidate.content.length !== current.content.length) {
    return candidate.content.length > current.content.length;
  }

  return getArticleRecordTimestamp(candidate) > getArticleRecordTimestamp(current);
}

/**
 * Sort article-like records newest-first so callers share one publication-date
 * ordering rule after deduplication.
 */
export function sortArticleRecordsByPublicationDateDesc<
  T extends Pick<ArticleRecordLike, "publicationDate">,
>(a: T, b: T): number {
  return getArticleRecordTimestamp(b) - getArticleRecordTimestamp(a);
}

function getArticleRecordTimestamp(
  record: Pick<ArticleRecordLike, "publicationDate">,
): number {
  return new Date(record.publicationDate).getTime();
}
