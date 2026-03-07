import type { CategoryTreeNode } from "@/lib/core/types";
import { DEFAULT_CATEGORY_LABEL } from "./categories";
import { tryNormalizeFeedUrl } from "./url";

import { CONFIG } from "@/lib/config";

export interface OpmlFeedImportEntry {
  name: string;
  url: string;
  category: string;
}

const getOutlineLabel = (outline: Element): string => {
  const text = outline.getAttribute("text")?.trim();
  if (text) {
    return text;
  }

  const title = outline.getAttribute("title")?.trim();
  return title ?? "";
};

const getFeedName = (outline: Element): string => {
  const label = getOutlineLabel(outline);
  if (label) {
    return label;
  }

  const xmlUrl = outline.getAttribute("xmlUrl")?.trim();
  return xmlUrl ?? "Imported Feed";
};

/**
 * Normalizes an OPML feed URL.  Returns null when the URL is invalid or uses a
 * non-HTTP(S) protocol.  Delegates to tryNormalizeFeedUrl for consistent
 * parsing / stripping behaviour across the codebase.
 */
const normalizeImportUrl = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  // tryNormalizeFeedUrl strips hash, credentials, and trailing slashes
  // using the same logic as the server-side normalizeFeedUrl.
  return tryNormalizeFeedUrl(rawUrl);
};

export const parseOpmlFeedImport = (opmlXml: string): OpmlFeedImportEntry[] => {
  const parser = new DOMParser();
  const document = parser.parseFromString(opmlXml, "text/xml");
  const parserError = document.getElementsByTagName("parsererror")[0];

  if (parserError) {
    throw new Error("Invalid OPML file.");
  }

  const body = document.getElementsByTagName("body")[0];
  if (!body) {
    throw new Error("OPML body is missing.");
  }

  const imported = new Map<string, OpmlFeedImportEntry>();

  const walkOutlineTree = (outline: Element, parentCategory: string | null) => {
    // Stop collecting once the cap is reached — prevents a crafted OPML with
    // thousands of entries from flooding the database via bulk import.
    if (imported.size >= CONFIG.OPML_MAX_IMPORT_ENTRIES) return;
    const xmlUrl = outline.getAttribute("xmlUrl")?.trim();

    if (xmlUrl) {
      // This is a feed outline — inherit the parent category, not its own label.
      const normalizedUrl = normalizeImportUrl(xmlUrl);
      if (!normalizedUrl) {
        return;
      }

      imported.set(normalizedUrl, {
        name: getFeedName(outline),
        url: normalizedUrl,
        category: parentCategory ?? DEFAULT_CATEGORY_LABEL,
      });
    } else {
      // This is a category/group outline — its label becomes the category for children.
      const groupCategory =
        getOutlineLabel(outline) || parentCategory || DEFAULT_CATEGORY_LABEL;

      const childOutlines = Array.from(outline.children).filter(
        (child): child is Element => child.tagName.toLowerCase() === "outline",
      );

      for (const childOutline of childOutlines) {
        walkOutlineTree(childOutline, groupCategory);
      }
    }
  };

  const rootOutlines = Array.from(body.children).filter(
    (child): child is Element => child.tagName.toLowerCase() === "outline",
  );

  for (const rootOutline of rootOutlines) {
    walkOutlineTree(rootOutline, null);
  }

  return [...imported.values()];
};

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const generateOpml = (categories: CategoryTreeNode[]): string => {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "<head><title>LibreRSS Subscriptions</title></head>",
    "<body>",
  ];
  for (const cat of categories) {
    const feeds = cat.children?.filter((c) => c.data?.url) ?? [];
    if (feeds.length === 0) continue;
    lines.push(
      `<outline text="${escapeXml(cat.label)}" title="${escapeXml(cat.label)}">`,
    );
    for (const feed of feeds) {
      lines.push(
        `<outline type="rss" text="${escapeXml(feed.label)}" title="${escapeXml(feed.label)}" xmlUrl="${escapeXml(feed.data!.url)}" />`,
      );
    }
    lines.push("</outline>");
  }
  lines.push("</body>", "</opml>");
  return lines.join("\n");
};
