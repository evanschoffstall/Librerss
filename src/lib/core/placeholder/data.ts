import {
  PLACEHOLDER_CATEGORY,
  PLACEHOLDER_SOURCE_DEFINITIONS,
} from "@/lib/core/placeholder-sources";
import { normalizeFeedUrl, tryNormalizeFeedUrl } from "@/lib/utils";

interface Article {
  content: string;
  feedId: number;
  id: number;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

interface FeedSource {
  category?: string;
  enabled?: boolean;
  extractionDisabled?: boolean;
  id: number;
  name: string;
  proxyEnabled?: boolean;
  url: string;
}

export { PLACEHOLDER_CATEGORY };

const createPlaceholderArticles = (
  feedId: number,
  seeds: {
    content: string;
    title: string;
    url: string;
  }[],
): Article[] => {
  const MINUTE = 60 * 1000;
  return seeds.map((seed, index) => ({
    content: seed.content,
    feedId,
    id: -(feedId * 100 + index + 1),
    lastChecked: new Date(Date.now() - (4 + index) * MINUTE),
    link: seed.url,
    publicationDate: new Date(Date.now() - (12 + index * 23) * MINUTE),
    title: seed.title,
  }));
};

const toLocalPlaceholderPath = (basePath: string, slug: string) =>
  `/placeholder-articles/${basePath}/${slug}.html`;

const buildPlaceholderSnapshotPathByUrl = (
  basePath: string,
  seeds: {
    slug: string;
    url: string;
  }[],
): Record<string, string> =>
  Object.fromEntries(
    seeds.map((seed) => [
      tryNormalizeFeedUrl(seed.url),
      toLocalPlaceholderPath(basePath, seed.slug),
    ]),
  );

export const PLACEHOLDER_FEED_SOURCES: FeedSource[] =
  PLACEHOLDER_SOURCE_DEFINITIONS.map((definition) => definition.source);

const PLACEHOLDER_SNAPSHOT_PATH_BY_URL: Record<string, string> =
  PLACEHOLDER_SOURCE_DEFINITIONS.reduce<Record<string, string>>(
    (snapshotPathsByUrl, { basePath, seeds }) => ({
      ...snapshotPathsByUrl,
      ...buildPlaceholderSnapshotPathByUrl(basePath, seeds),
    }),
    {},
  );

const PLACEHOLDER_ARTICLES_BY_SOURCE: Record<string, Article[]> =
  Object.fromEntries(
    PLACEHOLDER_SOURCE_DEFINITIONS.map(({ seeds, source }) => [
      normalizeFeedUrl(source.url),
      createPlaceholderArticles(source.id, seeds),
    ]),
  );

/** Resolves the article list exposed by one placeholder feed source. */
export const getPlaceholderArticlesForSource = (url: string): Article[] =>
  PLACEHOLDER_ARTICLES_BY_SOURCE[tryNormalizeFeedUrl(url)] ?? [];

/** Resolves the bundled local snapshot path for a placeholder article URL. */
export const getPlaceholderSnapshotPathByArticleUrl = (
  url: string,
): null | string => {
  const normalizedUrl = tryNormalizeFeedUrl(url);
  return PLACEHOLDER_SNAPSHOT_PATH_BY_URL[normalizedUrl] ?? null;
};
