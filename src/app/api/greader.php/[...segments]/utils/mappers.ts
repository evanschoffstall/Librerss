import { toReaderItemId } from "@/lib/core/reader-item-id";
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils/categories";
import { tryGetUrlHostname } from "@/lib/utils/url";

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

export function toReaderCategoryLabel(
  category: string | null | undefined,
): string {
  const trimmed = category?.trim();
  return trimmed ? trimmed : DEFAULT_CATEGORY_LABEL;
}

export function toReaderIconUrl(feedUrl: string): string {
  const hostname = tryGetUrlHostname(feedUrl);
  if (!hostname) {
    return "";
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}

export function mapArticleAsItem(row: ListedArticle) {
  const publishedSec = Math.floor(row.publicationDate.getTime() / 1000);
  const categories = ["user/-/state/com.google/reading-list"];
  const categoryLabel = toReaderCategoryLabel(row.category);

  categories.push(`user/-/label/${categoryLabel}`);

  if (row.isRead) {
    categories.push("user/-/state/com.google/read");
  }

  if (row.isStarred) {
    categories.push("user/-/state/com.google/starred");
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
    summary: { direction: "ltr", content: row.content },
    content: [{ direction: "ltr", content: row.content }],
    origin: {
      streamId: `feed/${row.sourceUrl}`,
      title: row.sourceName,
      htmlUrl: row.sourceUrl,
    },
  };
}
