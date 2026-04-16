import type { Dirent } from "node:fs";

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

if (typeof globalThis.gc !== "function") {
  globalThis.gc = async () => undefined;
}

/** Aggregates raw Playwright coverage artifacts into the reports consumed by repo checks. */

const PLAYWRIGHT_COVERAGE_OUTPUT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_OUTPUT_DIR ?? "coverage/playwright-raw";
const PLAYWRIGHT_COVERAGE_REPORT_DIR =
  process.env.PLAYWRIGHT_COVERAGE_REPORT_DIR ?? "coverage/playwright";

type CoverageSummary = Record<string, unknown>;
type RawCoverageData = Record<string, unknown> | V8CoverageEntry[];
const PROJECT_SOURCE_DIRECTORY_PATH = `${process.cwd().replaceAll("\\", "/")}/src/`;
const SUMMARY_METRIC_KEYS = [
  "lines",
  "statements",
  "functions",
  "branches",
  "branchesTrue",
] as const;

interface CoverageMetric {
  covered: number;
  pct: number;
  skipped: number;
  total: number;
}
type CoverageMetricKey = (typeof SUMMARY_METRIC_KEYS)[number];

type CoverageSummaryEntry = Partial<Record<CoverageMetricKey, CoverageMetric>>;

interface MonocartCoverageReport {
  add: (coverageData: RawCoverageData) => Promise<void>;
  cleanCache: () => Promise<void>;
  generate: () => Promise<unknown>;
}
type MonocartCoverageReportFactory = (
  options: Record<string, unknown>,
) => MonocartCoverageReport;
interface V8CoverageEntry {
  url: string;
}

/** Rejects bundle-only output so the coverage check cannot silently regress back to generated assets. */
async function assertSourceMappedCoverage(
  reportDirectoryPath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): Promise<void> {
  const summaryFilePath = join(reportDirectoryPath, "summary.json");
  const summary = JSON.parse(
    await readFile(summaryFilePath, "utf8"),
  ) as CoverageSummary;
  const sourceEntries = Object.keys(summary).filter((key) => key !== "total");

  if (
    sourceEntries.some((key) =>
      isTrackedProjectSourceFile(key, projectSourceFilePathSet),
    )
  ) {
    return;
  }

  throw new Error(
    "Playwright coverage did not map to project source files under src/. The generated report still points at bundle artifacts.",
  );
}

function getSummaryMetric(
  summaryEntry: CoverageSummaryEntry,
  metricKey: CoverageMetricKey,
): CoverageMetric | null {
  return summaryEntry[metricKey] ?? null;
}

/** Narrows unknown JSON objects so the script can reject invalid payloads early. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTrackedProjectSourceFile(
  sourcePath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): boolean {
  return projectSourceFilePathSet.has(normalizeCoveragePath(sourcePath));
}

/** Checks the minimal V8 entry shape Monocart expects from Playwright raw coverage dumps. */
function isV8CoverageEntry(value: unknown): value is V8CoverageEntry {
  return isRecord(value) && typeof value.url === "string";
}

/** Recursively lists files beneath a directory without relying on shell utilities. */
async function listFilesRecursively(directoryPath: string): Promise<string[]> {
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const nestedFiles = await Promise.all(
    directoryEntries.map(async (directoryEntry: Dirent) => {
      const entryPath = join(directoryPath, directoryEntry.name);
      if (directoryEntry.isDirectory()) {
        return await listFilesRecursively(entryPath);
      }

      return [entryPath];
    }),
  );

  return nestedFiles.flat();
}

/** Creates the Playwright-to-source coverage reports used by the repo checks. */
async function main(): Promise<void> {
  const monocartModule =
    (await import("monocart-coverage-reports")) as unknown as {
      default: MonocartCoverageReportFactory;
    };
  const MCR = monocartModule.default;
  const rawCoverageDirectoryPath = join(
    process.cwd(),
    PLAYWRIGHT_COVERAGE_OUTPUT_DIR,
  );
  const reportDirectoryPath = join(
    process.cwd(),
    PLAYWRIGHT_COVERAGE_REPORT_DIR,
  );
  const projectSourceFilePathSet = new Set(
    (await listFilesRecursively(join(process.cwd(), "src"))).map((filePath) =>
      normalizeCoveragePath(filePath),
    ),
  );
  const rawCoverageFilePaths = (
    await listFilesRecursively(rawCoverageDirectoryPath)
  )
    .filter((filePath) => filePath.endsWith(".json"))
    .sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));

  if (rawCoverageFilePaths.length === 0) {
    throw new Error(
      `No Playwright coverage JSON files were found in ${rawCoverageDirectoryPath}.`,
    );
  }

  const coverageReport = MCR({
    clean: true,
    cleanCache: true,
    logging: "error",
    name: "playwright-e2e",
    outputDir: reportDirectoryPath,
    reports: [
      ["html", { subdir: "html" }],
      ["json-summary", { file: "summary.json" }],
      ["lcovonly", { file: "lcov.info" }],
    ],
    sourceFilter: (sourcePath: string) =>
      isTrackedProjectSourceFile(sourcePath, projectSourceFilePathSet),
    sourcePath: (sourcePath: string, info: { distFile?: string }) =>
      normalizeCoveragePath(sourcePath, info.distFile),
  });

  for (const rawCoverageFilePath of rawCoverageFilePaths) {
    const rawCoverageJson = await readFile(rawCoverageFilePath, "utf8");
    const rawCoverageData = parseRawCoverageData(
      rawCoverageJson,
      rawCoverageFilePath,
    );

    await coverageReport.add(rawCoverageData);
  }

  const coverageResults = await coverageReport.generate();

  if (!coverageResults) {
    throw new Error("Playwright coverage generation did not produce results.");
  }

  await rewriteCoverageArtifacts(reportDirectoryPath, projectSourceFilePathSet);
  await assertSourceMappedCoverage(
    reportDirectoryPath,
    projectSourceFilePathSet,
  );

  console.log(
    `Generated Playwright coverage from ${rawCoverageFilePaths.length} raw file(s) into ${relative(process.cwd(), reportDirectoryPath) || "."}.`,
  );
}

function mergeCoverageMetric(
  summaryEntries: CoverageSummaryEntry[],
  metricKey: CoverageMetricKey,
): CoverageMetric {
  const total = summaryEntries.reduce(
    (sum, entry) => sum + (getSummaryMetric(entry, metricKey)?.total ?? 0),
    0,
  );
  const covered = summaryEntries.reduce(
    (sum, entry) => sum + (getSummaryMetric(entry, metricKey)?.covered ?? 0),
    0,
  );
  const skipped = summaryEntries.reduce(
    (sum, entry) => sum + (getSummaryMetric(entry, metricKey)?.skipped ?? 0),
    0,
  );

  return {
    covered,
    pct: total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2)),
    skipped,
    total,
  };
}

function normalizeCoveragePath(
  sourcePath: string,
  distFilePath?: string,
): string {
  const normalizedSourcePath = sourcePath.replaceAll("\\", "/");
  const normalizedDistFilePath = normalizeDistFilePath(distFilePath);

  if (normalizedSourcePath.startsWith(PROJECT_SOURCE_DIRECTORY_PATH)) {
    return normalizedSourcePath.slice(
      process.cwd().replaceAll("\\", "/").length + 1,
    );
  }

  if (normalizedSourcePath.startsWith("src/")) {
    if (normalizedDistFilePath.includes("/node_modules/")) {
      return `${normalizedDistFilePath}::${normalizedSourcePath}`;
    }

    return normalizedSourcePath;
  }

  const srcDirectoryIndex = normalizedSourcePath.lastIndexOf("/src/");
  if (srcDirectoryIndex >= 0 && !normalizedSourcePath.startsWith("/")) {
    return normalizedSourcePath.slice(srcDirectoryIndex + 1);
  }

  return normalizedSourcePath;
}

function normalizeDistFilePath(distFilePath?: string): string {
  return distFilePath?.replaceAll("\\", "/") ?? "";
}

/** Validates the parsed raw coverage payload before it reaches Monocart. */
function parseRawCoverageData(
  rawCoverageJson: string,
  rawCoverageFilePath: string,
): RawCoverageData {
  const parsedCoverageData: unknown = JSON.parse(rawCoverageJson) as unknown;

  if (Array.isArray(parsedCoverageData)) {
    if (parsedCoverageData.every(isV8CoverageEntry)) {
      return parsedCoverageData;
    }

    throw new Error(
      `Expected ${rawCoverageFilePath} to contain an array of V8 coverage entries with string urls.`,
    );
  }

  if (isRecord(parsedCoverageData)) {
    return parsedCoverageData;
  }

  throw new Error(
    `Expected ${rawCoverageFilePath} to contain a JSON object or an array of V8 coverage entries.`,
  );
}

async function rewriteCoverageArtifacts(
  reportDirectoryPath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): Promise<void> {
  await Promise.all([
    rewriteSummaryFile(reportDirectoryPath, projectSourceFilePathSet),
    rewriteLcovFile(reportDirectoryPath, projectSourceFilePathSet),
  ]);
}

async function rewriteLcovFile(
  reportDirectoryPath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): Promise<void> {
  const lcovFilePath = join(reportDirectoryPath, "lcov.info");
  const lcovBlocks = (await readFile(lcovFilePath, "utf8"))
    .split("end_of_record\n")
    .map((block) => block.trim())
    .filter(Boolean);
  const filteredBlocks = lcovBlocks.flatMap((block) => {
    const lines = block.split(/\r?\n/u);
    const sourceFileLine = lines.find((line) => line.startsWith("SF:"));
    if (!sourceFileLine) {
      return [];
    }

    const sourcePath = sourceFileLine.slice(3);
    if (!isTrackedProjectSourceFile(sourcePath, projectSourceFilePathSet)) {
      return [];
    }

    lines[lines.indexOf(sourceFileLine)] =
      `SF:${normalizeCoveragePath(sourcePath)}`;
    return [`${lines.join("\n")}\nend_of_record\n`];
  });

  await writeFile(lcovFilePath, filteredBlocks.join(""));
}

async function rewriteSummaryFile(
  reportDirectoryPath: string,
  projectSourceFilePathSet: ReadonlySet<string>,
): Promise<void> {
  const summaryFilePath = join(reportDirectoryPath, "summary.json");
  const summary = JSON.parse(
    await readFile(summaryFilePath, "utf8"),
  ) as CoverageSummary;
  const filteredEntries = Object.entries(summary)
    .filter(
      ([sourcePath]) =>
        sourcePath !== "total" &&
        isTrackedProjectSourceFile(sourcePath, projectSourceFilePathSet),
    )
    .map(
      ([sourcePath, summaryEntry]) =>
        [
          normalizeCoveragePath(sourcePath),
          summaryEntry as CoverageSummaryEntry,
        ] as const,
    );
  const totalEntry = Object.fromEntries(
    SUMMARY_METRIC_KEYS.map((metricKey) => [
      metricKey,
      mergeCoverageMetric(
        filteredEntries.map(([, summaryEntry]) => summaryEntry),
        metricKey,
      ),
    ]),
  );

  await writeFile(
    summaryFilePath,
    JSON.stringify({
      total: totalEntry,
      ...Object.fromEntries(filteredEntries),
    }),
  );
}

await main();
