import { NextRequest } from "next/server";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format as formatWithPrettier, resolveConfig } from "prettier";

/**
 * Regenerates expected HTML outputs for the reading-pipeline fixtures.
 */
import { POST } from "@/app/api/articles/extract/route";
import { serverApi } from "@/lib/server";

const ANONYMOUS_USER: serverApi.AuthenticatedUser = {
  email: "anonymous",
  expiresAt: new Date(Date.now() + 86_400_000),
  sessionId: -1,
  userId: -1,
};

/**
 * Normalizes regenerated fixture output with the repo's Prettier HTML settings.
 */
export async function formatExpectedReadingOutput(
  outputPath: string,
  extractedHtml: string,
): Promise<string> {
  const prettierConfig = (await resolveConfig(outputPath)) ?? {};
  const formattedHtml = await formatWithPrettier(extractedHtml, {
    ...prettierConfig,
    filepath: outputPath,
  });

  return formattedHtml.endsWith("\n") ? formattedHtml : `${formattedHtml}\n`;
}

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
    parseAndValidateArticleUrlFn: async (rawUrl: string) => rawUrl.trim(),
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
 * Produces a unified diff between the previous expected output and the new one.
 * Returns the diff file path, or null when no prior output existed or content is unchanged.
 */
function generateDiff(
  fixtureDir: string,
  articleName: string,
  outputPath: string,
  newOutput: string,
  timestamp: number,
): null | string {
  if (!existsSync(outputPath)) return null;

  const oldContent = readFileSync(outputPath, "utf8");
  if (oldContent === newOutput) return null;

  const articleNumber = articleName.split("-")[1];
  const diffPath = join(
    fixtureDir,
    `article-results-${articleNumber}-diff-${timestamp}.diff`,
  );

  const result = Bun.spawnSync(["diff", "-u", outputPath, "-"], {
    stdin: Buffer.from(newOutput),
  });

  const diffText = result.stdout.toString();
  writeFileSync(diffPath, diffText, "utf8");
  return diffPath;
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

  const timestamp = Date.now();

  for (const articleName of articleFiles) {
    const result = await regenerateReadingExpectation(
      fixtureDir,
      articleName,
      timestamp,
    );
    console.log(
      `regenerated ${result.articleName} -> ${result.outputPath} (${result.size} chars)`,
    );
    if (result.diffPath) {
      console.log(`  diff -> ${result.diffPath}`);
    }
  }
}

/**
 * Rebuilds one expected output fixture from its captured article HTML.
 */
async function regenerateReadingExpectation(
  fixtureDir: string,
  articleName: string,
  timestamp: number,
) {
  const inputPath = join(fixtureDir, `${articleName}.html`);
  const outputPath = resolveExpectedPath(fixtureDir, articleName);

  const downloadedHtml = readFileSync(inputPath, "utf8");
  const url = extractCanonicalUrlFromHtml(downloadedHtml, articleName);
  const cleaned = await extractViaApiRoute(url, downloadedHtml);

  if (!cleaned) {
    throw new Error(`${articleName} produced empty expectation output`);
  }

  const formattedOutput = await formatExpectedReadingOutput(
    outputPath,
    cleaned,
  );
  const diffPath = generateDiff(
    fixtureDir,
    articleName,
    outputPath,
    formattedOutput,
    timestamp,
  );

  writeFileSync(outputPath, formattedOutput, "utf8");
  return {
    articleName,
    diffPath,
    outputPath,
    size: formattedOutput.trimEnd().length,
  };
}

/**
 * Maps an input article fixture name to its paired expected output path.
 */
function resolveExpectedPath(fixtureDir: string, articleName: string): string {
  const articleNumber = articleName.split("-")[1];
  return join(fixtureDir, `article-results-${articleNumber}.html`);
}

/** Limits CLI auto-execution to direct `bun scripts/test-reading-pipeline-regen-results.ts` entrypoints. */
function shouldAutoRunReadingFixtureRegeneration(argv: string[]): boolean {
  const invokedScriptPath = argv[1];
  return (
    typeof invokedScriptPath === "string" &&
    invokedScriptPath.endsWith(
      "/scripts/test-reading-pipeline-regen-results.ts",
    )
  );
}

if (import.meta.main && shouldAutoRunReadingFixtureRegeneration(Bun.argv)) {
  void main();
}
