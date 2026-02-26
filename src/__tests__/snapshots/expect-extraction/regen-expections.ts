import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractFromHtml } from "@extractus/article-extractor";
import {
  cleanExtractedArticleHtml,
  extractDailyKosStoryFallbackHtml,
  getHostname,
  hasReadableArticleBody,
  hasDailyKosStoryImage,
  sanitizeExtractedContent,
} from "@/app/api/articles/extract/route";

const FIXTURE_URLS: Record<string, string> = {
  "article-1": "https://www.abc27.com/news/massive-fire-breaks-out-at-york-county-salvage-yard/",
  "article-2": "https://www.motherjones.com/politics/2026/02/epstein-files-oval-office-trump-white-house/",
  "article-3": "https://www.dailykos.com/stories/2026/2/25/2370437/-Mamdani-and-AOC-prove-who-s-really-the-party-of-family-values?pm_campaign=blog&pm_medium=rss&pm_source=main",
  "article-4": "https://news.sky.com/story/we-decided-to-stand-up-to-a-bully-says-ukrainian-who-swapped-wall-street-for-the-frontline-13511695",
};

function resolveExpectedPath(dir: string, articleName: string): string {
  const articleNumber = articleName.split("-")[1];
  return join(dir, `article-expect-${articleNumber}.html`);
}

async function regenerateExpectation(dir: string, articleName: string, url: string) {
  const inputPath = join(dir, `${articleName}.html`);
  const outputPath = resolveExpectedPath(dir, articleName);

  const downloadedHtml = readFileSync(inputPath, "utf8");

  const extracted = await extractFromHtml(downloadedHtml, url, {
    contentLengthThreshold: 120,
  });

  const rawContent =
    extracted?.content?.trim() || extracted?.description?.trim() || "";

  let cleaned = cleanExtractedArticleHtml(
    sanitizeExtractedContent(rawContent),
    url,
  ).trim();

  if (
    getHostname(url).endsWith("dailykos.com") &&
    (!hasDailyKosStoryImage(cleaned) || !hasReadableArticleBody(cleaned))
  ) {
    const fallbackContent = cleanExtractedArticleHtml(
      sanitizeExtractedContent(extractDailyKosStoryFallbackHtml(downloadedHtml)),
      url,
    ).trim();

    if (
      hasDailyKosStoryImage(fallbackContent) ||
      hasReadableArticleBody(fallbackContent) ||
      !cleaned
    ) {
      cleaned = fallbackContent;
    }
  }

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
    const url = FIXTURE_URLS[articleName];
    if (!url) {
      throw new Error(`No source URL configured for ${articleName}`);
    }

    const result = await regenerateExpectation(dir, articleName, url);
    console.log(`regenerated ${result.articleName} -> ${result.outputPath} (${result.size} chars)`);
  }
}

void main();
