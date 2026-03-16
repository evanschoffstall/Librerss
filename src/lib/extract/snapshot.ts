import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getPlaceholderSnapshotPathByArticleUrl } from "@/lib/core/placeholder";

import type { PlaceholderSnapshotHit } from "./constants";

export async function readPlaceholderSnapshotHtml(
  url: string,
): Promise<null | PlaceholderSnapshotHit> {
  const snapshotPath = getPlaceholderSnapshotPathByArticleUrl(url);
  if (!snapshotPath) return null;

  const normalizedSnapshotPath = snapshotPath.replace(/^\/+/, "");
  const filePath = join(process.cwd(), "public", normalizedSnapshotPath);

  try {
    const html = await readFile(filePath, "utf8");
    return { html, snapshotPath: `/${normalizedSnapshotPath}` };
  } catch {
    return null;
  }
}
