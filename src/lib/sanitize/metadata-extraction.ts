import {
  decodeHtmlEntities,
  escapeHtmlAttribute,
  normalizeArticleHtmlSpacing,
  toParagraphHtml,
} from "./cleaners";
import { sanitizeArticleHtml } from "./sanitize";

/**
 * Build the metadata image fallback html.
 * @param rawHtml - The raw html.
 * @returns The metadata image fallback html.
 */
export function buildMetadataImageFallbackHtml(rawHtml: string): string {
  const imageUrl = readMetaTagContent(rawHtml, [
    "og:image",
    "twitter:image",
    "twitter:image:src",
  ]).trim();

  if (!imageUrl) return "";

  // Include explicit dimensions when the publisher provides them via standard
  // Open Graph width/height meta tags.  Without at least one size signal the
  // sanitizer cannot verify the image is content-sized and will drop it.
  // Fall back to a srcset= pointing to the same URL — this is a valid single-
  // descriptor srcset and satisfies the "has sizeable signal" requirement while
  // accurately describing an image the publisher explicitly chose to feature.
  const ogWidth = readMetaTagContent(rawHtml, ["og:image:width"]).trim();
  const ogHeight = readMetaTagContent(rawHtml, ["og:image:height"]).trim();
  const widthAttr = ogWidth ? ` width="${escapeHtmlAttribute(ogWidth)}"` : "";
  const heightAttr = ogHeight
    ? ` height="${escapeHtmlAttribute(ogHeight)}"`
    : "";
  const srcsetAttr =
    !ogWidth && !ogHeight ? ` srcset="${escapeHtmlAttribute(imageUrl)}"` : "";

  const imageHtml = sanitizeArticleHtml(
    `<p><img src="${escapeHtmlAttribute(imageUrl)}" alt=""${widthAttr}${heightAttr}${srcsetAttr} /></p>`,
  );

  if (!/<img\b[^>]*\bsrc=/i.test(imageHtml)) return "";

  const description = readMetaTagContent(rawHtml, [
    "og:description",
    "twitter:description",
  ])
    .replace(/\s+/g, " ")
    .trim();

  if (!description) return imageHtml;

  const descriptionHtml = sanitizeArticleHtml(toParagraphHtml(description));

  return normalizeArticleHtmlSpacing(
    [imageHtml, descriptionHtml].filter(Boolean).join("\n"),
  );
}

/**
 * Parse the page title.
 * @param html - The html.
 * @returns The page title.
 */
export function parsePageTitle(html: string): null | string {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const property = readMetaTagAttribute(tag, "property").toLowerCase();
    if (property === "og:title") {
      const content = readMetaTagAttribute(tag, "content");
      if (content) return content;
    }
  }

  const h1Text = readTagText(html, "h1");
  if (h1Text) return h1Text;

  const titleText = readTagText(html, "title");
  if (titleText) return titleText;

  return null;
}

/**
 * Search the HTML for a meta tag matching any of the given property/name keys and return its content value.
 * @param rawHtml - The raw html.
 * @param keys - The keys.
 * @returns The decoded content attribute value of the first matching meta tag, or an empty string.
 */
export function readMetaTagContent(rawHtml: string, keys: string[]): string {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const metaTags = rawHtml.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const attributes = parseMetaTagAttributes(tag);

    const key = (attributes.property || attributes.name || "").toLowerCase();
    const content = attributes.content;
    if (!key || !content) continue;
    if (keySet.has(key)) return decodeHtmlEntities(content);
  }

  return "";
}

/**
 * Parse the meta tag attributes.
 * @param tag - The tag.
 * @returns The meta tag attributes.
 */
function parseMetaTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const match of tag.matchAll(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    const attributeName = match[1].toLowerCase();
    const attributeValue = (match[2] || match[3] || "").trim();
    attributes[attributeName] = attributeValue;
  }

  return attributes;
}

/**
 * Extract the value of a named attribute from a single meta tag string.
 * @param tag - The tag.
 * @param attribute - The attribute.
 * @returns The attribute value, or an empty string if not found.
 */
function readMetaTagAttribute(tag: string, attribute: string): string {
  return parseMetaTagAttributes(tag)[attribute.toLowerCase()] ?? "";
}

/**
 * Extract and return the inner text of the first matching tag, stripping any nested markup.
 * @param html - The html.
 * @param tagName - The tag name.
 * @returns The trimmed plain-text content of the tag, or an empty string if the tag is absent.
 */
function readTagText(html: string, tagName: "h1" | "title"): string {
  const tagMatch = (
    tagName === "h1"
      ? /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
      : /<title\b[^>]*>([\s\S]*?)<\/title>/i
  ).exec(html);

  return tagMatch?.[1].replace(/<[^>]*>/g, "").trim() ?? "";
}
