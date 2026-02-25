import { toReaderItemId } from "@/lib/core/reader-item-id";
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils/categories";
import { normalizeArticleHtmlSpacing } from "@/lib/utils/sanitize";
import { tryGetUrlHostname } from "@/lib/utils/url";
import {
  FEED_STREAM_PREFIX,
  READ_STATE,
  READING_LIST_STREAM,
  STARRED_STATE,
  USER_LABEL_PREFIX,
} from "../constants";

export type ListedArticle = {
  articleId: number;
  title: string;
  link: string;
  content: string;
  publicationDate: Date;
  sourceName: string;
  sourceUrl: string;
  category: string | null;
  isRead: boolean | null;
  isStarred: boolean | null;
};

function toReaderCategoryLabel(category: string | null | undefined): string {
  const trimmed = category?.trim();
  return trimmed ? trimmed : DEFAULT_CATEGORY_LABEL;
}

export function toReaderIconUrl(feedUrl: string): string | null {
  const hostname = tryGetUrlHostname(feedUrl);
  if (!hostname) {
    return null;
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}

export function mapArticleAsItem(row: ListedArticle) {
  const publishedSec = Math.floor(row.publicationDate.getTime() / 1000);
  const bodyContent = normalizeArticleHtmlSpacing(row.content).trim();
  const previewContent = bodyContent.length > 0 ? bodyContent : row.title;
  const categories = [READING_LIST_STREAM];
  const categoryLabel = toReaderCategoryLabel(row.category);

  categories.push(`${USER_LABEL_PREFIX}${categoryLabel}`);

  if (row.isRead) {
    categories.push(READ_STATE);
  }

  if (row.isStarred) {
    categories.push(STARRED_STATE);
  }

  return {
    id: toReaderItemId(row.articleId),
    crawlTimeMsec: String(row.publicationDate.getTime()),
    timestampUsec: String(row.publicationDate.getTime() * 1000),
    title: row.title,
    published: publishedSec,
    updated: publishedSec,
    categories,
    canonical: [{ href: row.link }],
    alternate: [{ href: row.link, type: "text/html" }],
    summary: { direction: "ltr", content: previewContent },
    content: { direction: "ltr", content: previewContent },
    origin: {
      streamId: `${FEED_STREAM_PREFIX}${row.sourceUrl}`,
      title: row.sourceName,
      htmlUrl: row.sourceUrl,
    },
  };
}
