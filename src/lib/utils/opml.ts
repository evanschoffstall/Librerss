export interface OpmlFeedImportEntry {
  name: string;
  url: string;
  category: string;
}

export const DEFAULT_CATEGORY_LABEL = "My Feeds";

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

const normalizeImportUrl = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
};

export const parseOpmlFeedImport = (opmlXml: string): OpmlFeedImportEntry[] => {
  const parser = new DOMParser();
  const document = parser.parseFromString(opmlXml, "text/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    throw new Error("Invalid OPML file.");
  }

  const body = document.querySelector("opml > body");
  if (!body) {
    throw new Error("OPML body is missing.");
  }

  const imported = new Map<string, OpmlFeedImportEntry>();

  const walkOutlineTree = (outline: Element, parentCategory: string | null) => {
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
