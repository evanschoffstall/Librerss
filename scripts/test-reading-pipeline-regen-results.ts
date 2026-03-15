/**
 * Regenerates expected HTML outputs for the reading-pipeline fixtures.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";

import { POST } from "@/app/api/articles/extract/route";
import type { AuthenticatedUser } from "@/lib/server";

const ANONYMOUS_USER: AuthenticatedUser = {
  email: "anonymous",
  expiresAt: new Date(Date.now() + 86_400_000),
  sessionId: -1,
  userId: -1,
};

/**
 * Derives a stable article URL from captured fixture HTML for extractor parity.
 */
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

/**
 * Runs the extract route against captured HTML without performing a live fetch.
 */
async function extractViaApiRoute(
  articleUrl: string,
  downloadedHtml: string,
): Promise<string> {
  const request = new NextRequest("http://localhost/api/articles/extract", {
    body: JSON.stringify({ url: articleUrl }),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    method: "POST",
  });

  const response = await POST(request, {
    errorFn: () => {},
    fetchHtmlFn: async () => downloadedHtml,
    parseAndValidateArticleUrlFn: async (rawUrl) => rawUrl.trim(),
    requireMutableAuthenticatedUserFn: async () => ANONYMOUS_USER,
    shouldUseExtractCacheFn: () => false,
    warnFn: () => {},
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as null | {
      error?: string;
    };
    throw new Error(
      `extract endpoint failed (${response.status}): ${body?.error ?? "unknown error"}`,
    );
  }

  const payload = (await response.json()) as { content?: string };
  return payload.content?.trim() ?? "";
}

/**
 * Regenerates every stored output fixture in the reading pipeline set.
 */
async function main() {
  const fixtureDir = join(process.cwd(), "tests/templates/reading-pipeline");

  const articleFiles = readdirSync(fixtureDir)
    .filter((name) => /^article-\d+\.html$/.test(name))
    .map((name) => name.replace(/\.html$/, ""))
    .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));

  for (const articleName of articleFiles) {
    const result = await regenerateReadingExpectation(fixtureDir, articleName);
    console.log(
      `regenerated ${result.articleName} -> ${result.outputPath} (${result.size} chars)`,
    );
  }
}

/**
 * Rebuilds one expected output fixture from its captured article HTML.
 */
async function regenerateReadingExpectation(
  fixtureDir: string,
  articleName: string,
) {
  const inputPath = join(fixtureDir, `${articleName}.html`);
  const outputPath = resolveExpectedPath(fixtureDir, articleName);

  const downloadedHtml = readFileSync(inputPath, "utf8");
  const url = extractCanonicalUrlFromHtml(downloadedHtml, articleName);
  const cleaned = await extractViaApiRoute(url, downloadedHtml);

  if (!cleaned) {
    throw new Error(`${articleName} produced empty expectation output`);
  }

  writeFileSync(outputPath, `${cleaned}\n`, "utf8");
  return { articleName, outputPath, size: cleaned.length };
}

/**
 * Maps an input article fixture name to its paired expected output path.
 */
function resolveExpectedPath(fixtureDir: string, articleName: string): string {
  const articleNumber = articleName.split("-")[1];
  return join(fixtureDir, `article-results-${articleNumber}.html`);
}

void main();
