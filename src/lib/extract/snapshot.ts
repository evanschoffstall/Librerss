import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getPlaceholderSnapshotPathByArticleUrl } from "@/lib/core/placeholder";

import type { PlaceholderSnapshotHit } from "./constants";

/**
 * Process the read placeholder snapshot html.
 * @param url - The url.
 * @returns The read placeholder snapshot html.
 */
export async function readPlaceholderSnapshotHtml(
  url: string,
): Promise<null | PlaceholderSnapshotHit> {
  const snapshotPath = getPlaceholderSnapshotPathByArticleUrl(url);
  if (!snapshotPath) return null;

  const normalizedSnapshotPath = snapshotPath.replace(/^\/+/, "");
  const filePath = join(process.cwd(), "public", normalizedSnapshotPath);

  try {
    const html = await readFile(filePath, "utf8");
    return {
      html: normalizePlaceholderSnapshotHtml(url, html),
      snapshotPath: `/${normalizedSnapshotPath}`,
    };
  } catch {
    return null;
  }
}

/**
 * Normalize the placeholder snapshot html.
 * @param articleUrl - The article url.
 * @param html - The html.
 * @returns The placeholder snapshot html.
 */
function normalizePlaceholderSnapshotHtml(
  articleUrl: string,
  html: string,
): string {
  const articleOrigin = new URL(articleUrl);

  return html
    .replace(
      /\b(href|poster|src)=(['"])(.*?)\2/gi,
      (match, attributeName: string, quote: string, rawValue: string) => {
        const normalizedValue = normalizeUrlAttributeValue(
          articleOrigin,
          rawValue,
        );
        if (normalizedValue === rawValue) {
          return match;
        }

        return `${attributeName}=${quote}${normalizedValue}${quote}`;
      },
    )
    .replace(
      /\bsrcset=(['"])(.*?)\1/gi,
      (match, quote: string, rawValue: string) => {
        const normalizedValue = normalizeSrcsetValue(articleOrigin, rawValue);
        if (normalizedValue === rawValue) {
          return match;
        }

        return `srcset=${quote}${normalizedValue}${quote}`;
      },
    );
}

/**
 * Normalize the srcset value.
 * @param baseUrl - The base url.
 * @param value - The value.
 * @returns The srcset value.
 */
function normalizeSrcsetValue(baseUrl: URL, value: string): string {
  return value
    .split(",")
    .map((candidate) => {
      const trimmedCandidate = candidate.trim();
      if (!trimmedCandidate) return candidate;

      const [rawUrl = "", ...descriptorParts] = trimmedCandidate.split(/\s+/);
      const normalizedUrl = normalizeUrlAttributeValue(baseUrl, rawUrl);
      const descriptor = descriptorParts.join(" ");

      return descriptor ? `${normalizedUrl} ${descriptor}` : normalizedUrl;
    })
    .join(", ");
}

/**
 * Normalize the url attribute value.
 * @param baseUrl - The base url.
 * @param value - The value.
 * @returns The url attribute value.
 */
function normalizeUrlAttributeValue(baseUrl: URL, value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) return value;
  if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(trimmedValue)) {
    return value;
  }

  try {
    const absoluteUrl = new URL(trimmedValue, baseUrl).toString();
    return value.replace(trimmedValue, absoluteUrl);
  } catch {
    return value;
  }
}
