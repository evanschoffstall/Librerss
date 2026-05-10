import { readAttrValue } from "@/lib/sanitize";

/** HTML tags that may represent a lead image near the selected prose body. */
const IMAGE_TAG_RE = /<img\b[^>]*>/gi;

/** Number of source characters before the body to inspect for a lead image. */
const LEAD_IMAGE_SEARCH_WINDOW = 16_000;

/** Asset URL or descriptor words that identify icons and publisher chrome. */
const NON_CONTENT_IMAGE_RE =
  /\b(?:avatar|button|headshot|icon|insignia|logo|menu|placeholder|search|sprite|toggle)\b|\bclose(?:[-_\s]+(?:button|icon))\b|\/extension\/|\/fontawesome\//i;

/**
 * Adds a nearby lead image that sits just before the selected prose container.
 * Many publishers keep featured images as siblings of the text container, so
 * body selection must preserve nearby content media without widening the body
 * to include share controls, author boxes, or related-card modules.
 * @param html - Full source HTML used for source-neighborhood lookup.
 * @param bodyHtml - Selected article body HTML.
 * @param bodyOpenIndex - Source index where the selected body begins.
 * @returns Body HTML prefixed with a content-like lead image when present.
 */
export function prependNearbyLeadImage(
  html: string,
  bodyHtml: string,
  bodyOpenIndex: number,
): string {
  if (hasLikelyBodyLeadImage(bodyHtml)) {
    return bodyHtml;
  }

  const leadImage = findNearbyLeadImage(html, bodyOpenIndex);
  return leadImage && !bodyHtml.includes(leadImage)
    ? `${leadImage}\n${bodyHtml}`
    : bodyHtml;
}

/**
 * Finds the last content-like image before the selected prose container.
 * @param html - Full source HTML used for source-neighborhood lookup.
 * @param bodyOpenIndex - Source index where the selected body begins.
 * @returns The nearest content image tag before the body, if one is present.
 */
function findNearbyLeadImage(html: string, bodyOpenIndex: number): string {
  const windowStart = Math.max(0, bodyOpenIndex - LEAD_IMAGE_SEARCH_WINDOW);
  const leadingHtml = html.slice(windowStart, bodyOpenIndex);
  const imageTags = [...leadingHtml.matchAll(IMAGE_TAG_RE)].map(
    (match) => match[0],
  );

  return imageTags.reverse().find(isLikelyContentImage) ?? "";
}

/**
 * Returns whether the selected body already carries content media near its
 * opening. When true, a preceding image is more likely to be a banner or ad than
 * the article lead image and should not be recovered.
 * @param bodyHtml - Selected article body HTML.
 * @returns Whether the opening portion of the body already contains article media.
 */
function hasLikelyBodyLeadImage(bodyHtml: string): boolean {
  const openingHtml = bodyHtml.trimStart().slice(0, 5_000);
  const searchStart = openingHtml.toLowerCase().startsWith("<p")
    ? Math.max(0, openingHtml.indexOf(">") + 1)
    : 0;
  const imageStart = openingHtml.toLowerCase().indexOf("<img", searchStart);
  if (imageStart < 0) {
    return false;
  }
  if (imageStart !== searchStart) {
    // Allow HTML tags (e.g. an anchor wrapper) before <img, but not visible text.
    // <a href="..."><img> at the body opening is a valid lead image pattern.
    const betweenText = openingHtml
      .slice(searchStart, imageStart)
      .replace(/<[^>]*>/g, "")
      .trim();
    if (betweenText) return false;
  }
  const imageEnd = openingHtml.indexOf(">", imageStart);
  return imageEnd > imageStart
    ? isLikelyContentImage(openingHtml.slice(imageStart, imageEnd + 1))
    : false;
}

/**
 * Returns whether an image tag looks like article media rather than site chrome.
 * Accepts images with absent or empty alt text when the URL clearly points to
 * media — a common publisher omission for article photos. Rejects images with
 * whitespace-only alt (e.g. Alt=" "), which intentionally signals decorative
 * content per accessibility convention.
 * @param imageTag - Raw image tag to inspect.
 * @returns Whether the image is suitable as a recovered lead image.
 */
function isLikelyContentImage(imageTag: string): boolean {
  const source = readAttrValue(imageTag, "src") ?? "";
  const altText = readAttrValue(imageTag, "alt") ?? "";
  const descriptor = `${source} ${altText}`.trim();

  // Block images with no src, chrome-indicating descriptors, or whitespace-only
  // alt text. Truly empty alt (alt="" or absent) is allowed when the URL passes.
  if (
    !source ||
    (altText !== "" && !altText.trim()) ||
    NON_CONTENT_IMAGE_RE.test(descriptor)
  ) {
    return false;
  }

  return (
    altText.length >= 24 ||
    /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(source)
  );
}
