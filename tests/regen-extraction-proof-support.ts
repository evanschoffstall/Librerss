import { NextRequest } from "next/server";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { format as formatWithPrettier, resolveConfig } from "prettier";

import { POST } from "@/app/api/articles/extract/route";
import { PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources";
import { readPlaceholderSnapshotHtml } from "@/lib/extract";
import { serverApi } from "@/lib/server";

const ANONYMOUS_USER: serverApi.AuthenticatedUser = {
  email: "anonymous",
  expiresAt: new Date(Date.now() + 86_400_000),
  isAdmin: false,
  sessionId: -1,
  userId: -1,
};
const PLACEHOLDER_ARTICLES_DIR = join(
  process.cwd(),
  "public/placeholder-articles",
);

export const EXTRACTION_PROOF_EXPECTED_DIR = join(
  process.cwd(),
  "tests/regen-extraction-proof",
);

/** A detected mismatch between generated and checked-in proof outputs. */
export interface ExtractionProofDiff {
  expectedFileName: string;
  kind: "changed" | "created" | "stale";
  relativeInputPath?: string;
}

/** Generated proof output for one placeholder article snapshot. */
export interface ExtractionProofOutput {
  content: string;
  expectedFileName: string;
  relativeInputPath: string;
  title: string;
}

/** Server extraction payload returned by the article extraction route. */
interface ExtractedArticlePayload {
  content?: string;
  source?: null | string;
  title?: null | string;
}

/** Manifest lookup keyed by placeholder snapshot path relative to public/placeholder-articles. */
type PlaceholderManifestByPath = Map<string, { title: string; url: string }>;

/** Metadata needed to run one placeholder snapshot through the proof pipeline. */
interface PlaceholderProofInput {
  articleUrl: string;
  displayTitle: string;
  inputPath: string;
  relativeInputPath: string;
}

/**
 * Compare generated extraction proof output with checked-in expected fixtures.
 * @param generatedOutputs - Fresh outputs produced from placeholder snapshots.
 * @returns Created, changed, and stale fixture diffs.
 */
export function compareExtractionProofOutputs(
  generatedOutputs: ExtractionProofOutput[],
): ExtractionProofDiff[] {
  const generatedByFileName = new Map(
    generatedOutputs.map((output) => [output.expectedFileName, output]),
  );
  const expectedFileNames = listExpectedProofFileNames();
  const diffs: ExtractionProofDiff[] = [];

  for (const output of generatedOutputs) {
    const expectedPath = join(
      EXTRACTION_PROOF_EXPECTED_DIR,
      output.expectedFileName,
    );
    if (!existsSync(expectedPath)) {
      diffs.push({
        expectedFileName: output.expectedFileName,
        kind: "created",
        relativeInputPath: output.relativeInputPath,
      });
      continue;
    }

    const expectedContent = readFileSync(expectedPath, "utf8");
    if (expectedContent !== output.content) {
      diffs.push({
        expectedFileName: output.expectedFileName,
        kind: "changed",
        relativeInputPath: output.relativeInputPath,
      });
    }
  }

  for (const expectedFileName of expectedFileNames) {
    if (!generatedByFileName.has(expectedFileName)) {
      diffs.push({ expectedFileName, kind: "stale" });
    }
  }

  return diffs.sort((a, b) =>
    `${a.kind}:${a.expectedFileName}`.localeCompare(
      `${b.kind}:${b.expectedFileName}`,
    ),
  );
}

/**
 * Format generated HTML with the repository Prettier configuration.
 * @param outputPath - The output path used to resolve Prettier settings.
 * @param extractedHtml - The generated HTML document or fragment.
 * @returns The formatted HTML with a trailing newline.
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
 * Generate all extraction proof outputs from bundled placeholder article HTML.
 * @returns Formatted expected HTML fragments keyed by their flat fixture names.
 */
export async function generateExtractionProofOutputs(): Promise<
  ExtractionProofOutput[]
> {
  const placeholderInputs = resolvePlaceholderProofInputs();
  const outputs: ExtractionProofOutput[] = [];

  for (const proofInput of placeholderInputs) {
    outputs.push(await generateExtractionProofOutput(proofInput));
  }

  return outputs;
}

/**
 * Write generated proof outputs into the checked-in expected fixture directory.
 * Stale HTML files are removed so the directory mirrors current placeholders.
 * @param generatedOutputs - Fresh generated proof outputs to persist.
 */
export function writeExtractionProofOutputs(
  generatedOutputs: ExtractionProofOutput[],
): void {
  mkdirSync(EXTRACTION_PROOF_EXPECTED_DIR, { recursive: true });

  for (const expectedFileName of listExpectedProofFileNames()) {
    if (
      !generatedOutputs.some(
        (output) => output.expectedFileName === expectedFileName,
      )
    ) {
      unlinkSync(join(EXTRACTION_PROOF_EXPECTED_DIR, expectedFileName));
    }
  }

  for (const output of generatedOutputs) {
    writeFileSync(
      join(EXTRACTION_PROOF_EXPECTED_DIR, output.expectedFileName),
      output.content,
      "utf8",
    );
  }
}

/**
 * Create the manifest lookup used to recover canonical URLs for local snapshots.
 * Files outside the manifest still run with canonical metadata parsed from HTML.
 * @returns Placeholder metadata keyed by relative snapshot path.
 */
function buildPlaceholderManifestByPath(): PlaceholderManifestByPath {
  return new Map(
    PLACEHOLDER_SOURCE_DEFINITIONS.flatMap(({ basePath, seeds }) =>
      seeds.map((seed) => [
        `${basePath}/${seed.slug}.html`,
        { title: seed.title, url: seed.url },
      ]),
    ),
  );
}

/**
 * Extract the best canonical URL available in a standalone HTML snapshot.
 * @param html - Raw article snapshot HTML.
 * @param fixtureName - Source filename stem used for deterministic fallback URLs.
 * @returns The canonical URL, Open Graph URL, or fallback invalid URL.
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
 * Run downloaded HTML through the article extraction route used by the app.
 * @param articleUrl - Canonical article URL submitted to the route.
 * @param downloadedHtml - Snapshot HTML returned by the route fetch dependency.
 * @returns The route extraction payload.
 */
async function extractViaApiRoute(
  articleUrl: string,
  downloadedHtml: string,
): Promise<ExtractedArticlePayload> {
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

  return (await response.json()) as ExtractedArticlePayload;
}

/**
 * Run one placeholder article through route extraction and sanitization.
 * @param proofInput - Placeholder snapshot metadata and source path.
 * @returns Formatted expected proof output for the placeholder article.
 */
async function generateExtractionProofOutput(
  proofInput: PlaceholderProofInput,
): Promise<ExtractionProofOutput> {
  const downloadedHtml = await resolvePlaceholderHtml(proofInput);
  const extractedPayload = await extractViaApiRoute(
    proofInput.articleUrl,
    downloadedHtml,
  );
  const sanitizedArticleHtml = extractedPayload.content?.trim() ?? "";
  const expectedFileName = resolveProofOutputFileName(
    proofInput.relativeInputPath,
  );
  const content = await formatExpectedReadingOutput(
    join(EXTRACTION_PROOF_EXPECTED_DIR, expectedFileName),
    sanitizedArticleHtml,
  );

  return {
    content,
    expectedFileName,
    relativeInputPath: proofInput.relativeInputPath,
    title: extractedPayload.title ?? proofInput.displayTitle,
  };
}

/**
 * List checked-in expected proof file names in deterministic order.
 * @returns Flat expected proof HTML file names.
 */
function listExpectedProofFileNames(): string[] {
  if (!existsSync(EXTRACTION_PROOF_EXPECTED_DIR)) return [];

  return readdirSync(EXTRACTION_PROOF_EXPECTED_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Recursively list HTML files under the placeholder article snapshot root.
 * @param directoryPath - Directory to inspect.
 * @returns Absolute HTML file paths in deterministic order.
 */
function listHtmlFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directoryPath, entry.name);
      if (entry.isDirectory()) return listHtmlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
    })
    .sort();
}

/**
 * Load manifest-backed snapshots through the runtime placeholder reader so
 * relative asset URLs are normalized exactly as runtime extraction sees them.
 * @param proofInput - The placeholder proof input.
 * @returns HTML to submit to the extraction route.
 */
async function resolvePlaceholderHtml(
  proofInput: PlaceholderProofInput,
): Promise<string> {
  const snapshot = await readPlaceholderSnapshotHtml(proofInput.articleUrl);
  if (snapshot) return snapshot.html;

  return readFileSync(proofInput.inputPath, "utf8");
}

/**
 * Resolve all placeholder proof inputs from bundled HTML snapshots.
 * @returns Proof inputs for every HTML file under public/placeholder-articles.
 */
function resolvePlaceholderProofInputs(): PlaceholderProofInput[] {
  if (!existsSync(PLACEHOLDER_ARTICLES_DIR)) {
    throw new Error(
      `Missing placeholder article directory: ${PLACEHOLDER_ARTICLES_DIR}`,
    );
  }

  const manifestByPath = buildPlaceholderManifestByPath();
  return listHtmlFiles(PLACEHOLDER_ARTICLES_DIR).map((inputPath) => {
    const relativeInputPath = relative(PLACEHOLDER_ARTICLES_DIR, inputPath)
      .split(sep)
      .join("/");
    const manifestEntry = manifestByPath.get(relativeInputPath);
    const html = readFileSync(inputPath, "utf8");
    const articleName = basename(inputPath, extname(inputPath));

    return {
      articleUrl:
        manifestEntry?.url ?? extractCanonicalUrlFromHtml(html, articleName),
      displayTitle: manifestEntry?.title ?? articleName,
      inputPath,
      relativeInputPath,
    };
  });
}

/**
 * Resolve the flat proof output file name for a placeholder source file.
 * @param relativeInputPath - Source path relative to public/placeholder-articles.
 * @returns Flat expected proof HTML file name.
 */
function resolveProofOutputFileName(relativeInputPath: string): string {
  return relativeInputPath.split("/").join("__");
}
