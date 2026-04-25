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
 * Process the format expected reading output.
 * @param outputPath - The output path.
 * @param extractedHtml - The extracted html.
 * @returns The format expected reading output.
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
 * Process the extract canonical url from html.
 * @param html - The html.
 * @param fixtureName - The fixture name.
 * @returns The extract canonical url from html.
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
 * Process the extract via api route.
 * @param articleUrl - The article url.
 * @param downloadedHtml - The downloaded html.
 * @returns The extract via api route.
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
    /**
     * Process the error fn.
     */
    errorFn: () => {},
    /**
     * Process the fetch html fn.
     * @returns The fetch html fn.
     */
    fetchHtmlFn: async () => downloadedHtml,
    /**
     * Parse the and validate article url fn.
     * @param rawUrl - The raw url.
     * @returns The and validate article url fn.
     */
    parseAndValidateArticleUrlFn: async (rawUrl: string) => rawUrl.trim(),
    /**
     * Process the require mutable authenticated user fn.
     * @returns The require mutable authenticated user fn.
     */
    requireMutableAuthenticatedUserFn: async () => ANONYMOUS_USER,
    /**
     * Return whether should use extract cache fn.
     * @returns Whether should use extract cache fn.
     */
    shouldUseExtractCacheFn: () => false,
    /**
     * Process the warn fn.
     */
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
 * Process the generate diff.
 * @param fixtureDir - The fixture dir.
 * @param articleName - The article name.
 * @param outputPath - The output path.
 * @param newOutput - The new output.
 * @param timestamp - The timestamp.
 * @returns The generate diff.
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
 * Process the main.
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
 * Process the regenerate reading expectation.
 * @param fixtureDir - The fixture dir.
 * @param articleName - The article name.
 * @param timestamp - The timestamp.
 * @returns The regenerate reading expectation.
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
 * Resolve the expected path.
 * @param fixtureDir - The fixture dir.
 * @param articleName - The article name.
 * @returns The expected path.
 */
function resolveExpectedPath(fixtureDir: string, articleName: string): string {
  const articleNumber = articleName.split("-")[1];
  return join(fixtureDir, `article-results-${articleNumber}.html`);
}

/**
 * Return whether should auto run reading fixture regeneration.
 * @param argv - The argv.
 * @returns Whether should auto run reading fixture regeneration.
 */
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
