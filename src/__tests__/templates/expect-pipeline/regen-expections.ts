import {
  cleanExtractedArticleHtml,
  sanitizeExtractedContent,
} from "@/app/api/articles/extract/route";
import { extractFromHtml } from "@extractus/article-extractor";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function extractCanonicalUrlFromHtml(
  html: string,
  fixtureName: string,
): string {
  const canonicalMatch = html.match(
    /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
  );
  if (canonicalMatch?.[1]) return canonicalMatch[1];

  const ogUrlMatch = html.match(
    /<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i,
  );
  if (ogUrlMatch?.[1]) return ogUrlMatch[1];

  return `https://example.invalid/${fixtureName}`;
}

function resolveExpectedPath(dir: string, articleName: string): string {
  const articleNumber = articleName.split("-")[1];
  return join(dir, `article-expect-${articleNumber}.html`);
}

async function regenerateExpectation(dir: string, articleName: string) {
  const inputPath = join(dir, `${articleName}.html`);
  const outputPath = resolveExpectedPath(dir, articleName);

  const downloadedHtml = readFileSync(inputPath, "utf8");
  const url = extractCanonicalUrlFromHtml(downloadedHtml, articleName);

  const extracted = await extractFromHtml(downloadedHtml, url, {
    contentLengthThreshold: 120,
  });

  const rawContent =
    extracted?.content?.trim() || extracted?.description?.trim() || "";

  const cleaned = cleanExtractedArticleHtml(
    sanitizeExtractedContent(rawContent),
    url,
  ).trim();

  if (!cleaned) {
    throw new Error(`${articleName} produced empty expectation output`);
  }

  writeFileSync(outputPath, `${cleaned}\n`, "utf8");
  return { articleName, outputPath, size: cleaned.length };
}

async function main() {
  const dir = __dirname;

  const articleFiles = readdirSync(dir)
    .filter((name) => /^article-\d+\.html$/.test(name))
    .map((name) => name.replace(/\.html$/, ""))
    .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));

  for (const articleName of articleFiles) {
    const result = await regenerateExpectation(dir, articleName);
    console.log(
      `regenerated ${result.articleName} -> ${result.outputPath} (${result.size} chars)`,
    );
  }
}

void main();
