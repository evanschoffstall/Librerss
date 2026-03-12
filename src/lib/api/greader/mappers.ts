import {
  FEED_STREAM_PREFIX,
  READ_STATE,
  READING_LIST_STREAM,
  STARRED_STATE,
  toReaderItemId,
  USER_LABEL_PREFIX,
} from "@/lib/core/stream-ids";
import { normalizeArticleHtmlSpacing } from "@/lib/sanitize";
import { toCategoryLabelOrDefault } from "@/lib/utils/categories";
import { tryGetUrlHostname } from "@/lib/utils/url";

export interface ListedArticle {
  articleId: number;
  category: null | string;
  content: string;
  isRead: boolean | null;
  isStarred: boolean | null;
  link: string;
  publicationDate: Date;
  sourceName: string;
  sourceUrl: string;
  title: string;
}

export function mapArticleAsItem(row: ListedArticle) {
  const publishedSec = Math.floor(row.publicationDate.getTime() / 1000);
  const bodyContent = normalizeArticleHtmlSpacing(row.content).trim();
  const previewContent = bodyContent.length > 0 ? bodyContent : row.title;
  const categories = [READING_LIST_STREAM];
  const categoryLabel = toCategoryLabelOrDefault(row.category);

  categories.push(`${USER_LABEL_PREFIX}${categoryLabel}`);

  if (row.isRead) {
    categories.push(READ_STATE);
  }

  if (row.isStarred) {
    categories.push(STARRED_STATE);
  }

  return {
    alternate: [{ href: row.link, type: "text/html" }],
    canonical: [{ href: row.link }],
    categories,
    content: { content: previewContent, direction: "ltr" },
    crawlTimeMsec: String(row.publicationDate.getTime()),
    id: toReaderItemId(row.articleId),
    origin: {
      htmlUrl: row.sourceUrl,
      streamId: `${FEED_STREAM_PREFIX}${row.sourceUrl}`,
      title: row.sourceName,
    },
    published: publishedSec,
    summary: { content: previewContent, direction: "ltr" },
    timestampUsec: String(row.publicationDate.getTime() * 1000),
    title: row.title,
    updated: publishedSec,
  };
}

export function toReaderIconUrl(feedUrl: string): null | string {
  const hostname = tryGetUrlHostname(feedUrl);
  if (!hostname) {
    return null;
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}
