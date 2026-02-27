import {
  cleanExtractedArticleHtml,
  preCleanHtmlForExtraction,
  sanitizeExtractedContent,
} from "@/app/api/articles/extract/route";
import { extractFromHtml } from "@extractus/article-extractor";
import { readFileSync } from "node:fs";
const file =
  "./public/placeholder-articles/livescience/neanderthals-interbred.html";
const url =
  "https://www.livescience.com/archaeology/neanderthals/humans-and-neanderthals-interbred-but-it-was-mostly-male-neanderthals-and-female-humans-who-coupled-up-study-finds";
const html = readFileSync(file, "utf8");
const preCleaned = preCleanHtmlForExtraction(html);
const extracted = await extractFromHtml(preCleaned, url, {
  contentLengthThreshold: 120,
});
const raw = extracted?.content?.trim() || extracted?.description?.trim() || "";
const sanitized = sanitizeExtractedContent(raw);
const final = cleanExtractedArticleHtml(sanitized, url);
const paras = (final.match(/<p\b/gi) ?? []).length;
console.log({
  rawLen: raw.length,
  sanitizedLen: sanitized.length,
  finalLen: final.length,
  paras,
  hasImage: /<img\b/i.test(final),
  hasDisplayPrompt: final.includes("display name"),
});
console.log("\nFINAL (first 2000):\n", final.slice(0, 2000));
